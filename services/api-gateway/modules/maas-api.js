#!/usr/bin/env node

/**
 * Onasis-CORE MaaS API Module
 * Memory as a Service endpoints with project scope enforcement
 * Enforces project_scope='maas' and provides centralized data access
 */

const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const winston = require("winston");
const router = express.Router();

// Initialize logger
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: "onasis-maas-api" },
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

// Initialize Supabase client with service role (server-side only)
const supabaseUrl = process.env.SUPABASE_URL=https://<project-ref>.supabase.co
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error(
    "SUPABASE_URL=https://<project-ref>.supabase.co
  );
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const resolveOrganizationId = (req) =>
  req.user?.organization_id ||
  req.user?.organizationId ||
  req.user?.vendor_org_id ||
  req.headers["x-organization-id"] ||
  null;

// JWT verification middleware with project scope enforcement
const verifyMaasAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "No token provided",
        code: "AUTH_REQUIRED",
      });
    }

    const token = authHeader.substring(7);

    // Verify with central auth gateway
    const response = await fetch(
      `${process.env.AUTH_GATEWAY_URL}/v1/auth/verify`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      return res.status(401).json({
        error: "Invalid token",
        code: "AUTH_INVALID",
      });
    }

    const payload = await response.json();

    // Verify project scope
    if (payload.project_scope !== "maas") {
      return res.status(403).json({
        error: "Insufficient scope for MaaS operations",
        required_scope: "maas",
        provided_scope: payload.project_scope,
        code: "SCOPE_INSUFFICIENT",
      });
    }

    req.user = payload;
    req.userId = payload.sub;
    req.userRole = payload.role;
    next();
  } catch (error) {
    logger.error("Auth verification failed", {
      error: error.message,
      requestId: req.anonymousId,
    });
    return res.status(401).json({
      error: "Authentication failed",
      code: "AUTH_FAILED",
    });
  }
};

// Audit logging middleware
const auditLog = async (req, res, next) => {
  const startTime = Date.now();

  // Capture original res.json to log response
  const originalJson = res.json;
  res.json = function (body) {
    const responseTime = Date.now() - startTime;

    // Log to Core audit system
    logAuditEvent({
      project: "maas",
      user_id: req.userId,
      service_id: "lanonasis-maas",
      endpoint: req.path,
      method: req.method,
      status: res.statusCode,
      response_time: responseTime,
      error: res.statusCode >= 400 ? body.error : null,
      timestamp: new Date().toISOString(),
    });

    return originalJson.call(this, body);
  };

  next();
};

// Audit logging function
const logAuditEvent = async (event) => {
  try {
    const { data, error } = await supabase.from("core.logs").insert([event]);

    if (error) {
      logger.error("Failed to log audit event", { error: error.message });
    }
  } catch (error) {
    // Best-effort logging - don't break user flow
    logger.error("Audit logging failed", { error: error.message });
  }
};

// Apply middleware to all MaaS routes
router.use(verifyMaasAuth);
router.use(auditLog);

// Memory Management Endpoints

// GET /api/v1/maas/memories - List memories with pagination
router.get("/api/v1/memory", async (req, res) => {
  try {
    const { page = 1, limit = 50, type, memory_type, tags, search } = req.query;

    const organizationId = resolveOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({
        error: "Organization context required",
        code: "ORG_CONTEXT_REQUIRED",
      });
    }

    const offset = (page - 1) * limit;

    let query = supabase
      .from("memory_entries")
      .select("*", { count: "exact" })
      .eq("organization_id", organizationId)
      .eq("user_id", req.userId)
      .range(offset, offset + limit - 1)
      .order("created_at", { ascending: false });

    // Apply filters
    const normalizedType = memory_type || type;
    if (normalizedType) {
      query = query.eq("memory_type", normalizedType);
    }

    if (tags) {
      const tagArray = tags.split(",");
      query = query.contains("tags", tagArray);
    }

    if (search) {
      // Use text search or vector similarity if available
      query = query.ilike("title", `%${search}%`);
    }

    const { data, error, count } = await query;

    if (error) {
      logger.error("Failed to fetch memories", {
        error: error.message,
        userId: req.userId,
      });
      return res.status(500).json({
        error: "Failed to fetch memories",
        code: "FETCH_FAILED",
      });
    }

    res.json({
      data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        total_pages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    logger.error("Memory list error", {
      error: error.message,
      userId: req.userId,
    });
    res.status(500).json({
      error: "Internal server error",
      code: "INTERNAL_ERROR",
    });
  }
});

// POST /api/v1/maas/memories - Create new memory
router.post("/api/v1/memory", async (req, res) => {
  try {
    const { title, content, type, memory_type, tags, metadata } = req.body;

    // Validate required fields
    if (!title || !content) {
      return res.status(400).json({
        error: "Title and content are required",
        code: "VALIDATION_ERROR",
      });
    }

    const organizationId = resolveOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({
        error: "Organization context required",
        code: "ORG_CONTEXT_REQUIRED",
      });
    }

    const resolvedMemoryType = memory_type || type || "context";

    // Generate embedding if OpenAI key is available
    let embedding = null;
    if (process.env.OPENAI_API_KEY) {
      try {
        const embeddingResponse = await fetch(
          "https://api.openai.com/v1/embeddings",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "text-embedding-ada-002",
              input: `${title}\n${content}`,
            }),
          }
        );

        if (embeddingResponse.ok) {
          const embeddingData = await embeddingResponse.json();
          embedding = embeddingData.data[0].embedding;
        }
      } catch (embeddingError) {
        logger.warn("Failed to generate embedding", {
          error: embeddingError.message,
        });
      }
    }

    const memoryData = {
      user_id: req.userId,
      organization_id: organizationId,
      title,
      content,
      memory_type: resolvedMemoryType,
      tags: tags || [],
      metadata: metadata || {},
      embedding,
    };

    const { data, error } = await supabase
      .from("memory_entries")
      .insert([memoryData])
      .select()
      .single();

    if (error) {
      logger.error("Failed to create memory", {
        error: error.message,
        userId: req.userId,
      });
      return res.status(500).json({
        error: "Failed to create memory",
        code: "CREATE_FAILED",
      });
    }

    res.status(201).json({ data });
  } catch (error) {
    logger.error("Memory creation error", {
      error: error.message,
      userId: req.userId,
    });
    res.status(500).json({
      error: "Internal server error",
      code: "INTERNAL_ERROR",
    });
  }
});

// GET /api/v1/maas/memories/:id - Get specific memory
// GET /api/v1/memory/:id - Get specific memory
router.get("/api/v1/memory/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = resolveOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({
        error: "Organization context required",
        code: "ORG_CONTEXT_REQUIRED",
      });
    }

    const { data, error } = await supabase
      .from("memory_entries")
      .select("*")
      .eq("id", id)
      .eq("organization_id", organizationId)
      .eq("user_id", req.userId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return res.status(404).json({
          error: "Memory not found",
          code: "NOT_FOUND",
        });
      }

      logger.error("Failed to fetch memory", {
        error: error.message,
        memoryId: id,
        userId: req.userId,
      });
      return res.status(500).json({
        error: "Failed to fetch memory",
        code: "FETCH_FAILED",
      });
    }

    // Update access tracking
    await supabase
      .from("memory_entries")
      .update({
        last_accessed_at: new Date().toISOString(),
        access_count: (data?.access_count || 0) + 1,
      })
      .eq("id", id)
      .eq("organization_id", organizationId)
      .eq("user_id", req.userId);

    res.json({ data });
  } catch (error) {
    logger.error("Memory fetch error", {
      error: error.message,
      memoryId: req.params.id,
      userId: req.userId,
    });
    res.status(500).json({
      error: "Internal server error",
      code: "INTERNAL_ERROR",
    });
  }
});

// PUT /api/v1/maas/memories/:id - Update memory
// PUT /api/v1/memory/:id - Update memory
router.put("/api/v1/memory/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, type, memory_type, tags, metadata } = req.body;
    const organizationId = resolveOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({
        error: "Organization context required",
        code: "ORG_CONTEXT_REQUIRED",
      });
    }

    // Check if memory exists and belongs to user
    const { error: fetchError } = await supabase
      .from("memory_entries")
      .select("id")
      .eq("id", id)
      .eq("organization_id", organizationId)
      .eq("user_id", req.userId)
      .single();

    if (fetchError) {
      if (fetchError.code === "PGRST116") {
        return res.status(404).json({
          error: "Memory not found",
          code: "NOT_FOUND",
        });
      }

      return res.status(500).json({
        error: "Failed to verify memory ownership",
        code: "VERIFICATION_FAILED",
      });
    }

    // Generate new embedding if content changed
    let embedding = null;
    if ((title || content) && process.env.OPENAI_API_KEY) {
      try {
        const embeddingResponse = await fetch(
          "https://api.openai.com/v1/embeddings",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "text-embedding-ada-002",
              input: `${title}\n${content}`,
            }),
          }
        );

        if (embeddingResponse.ok) {
          const embeddingData = await embeddingResponse.json();
          embedding = embeddingData.data[0].embedding;
        }
      } catch (embeddingError) {
        logger.warn("Failed to generate embedding for update", {
          error: embeddingError.message,
        });
      }
    }

    const resolvedMemoryType = memory_type || type;

    const updateData = {
      ...(title && { title }),
      ...(content && { content }),
      ...(resolvedMemoryType && { memory_type: resolvedMemoryType }),
      ...(tags && { tags }),
      ...(metadata && { metadata }),
      ...(embedding && { embedding }),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("memory_entries")
      .update(updateData)
      .eq("id", id)
      .eq("organization_id", organizationId)
      .eq("user_id", req.userId)
      .select()
      .single();

    if (error) {
      logger.error("Failed to update memory", {
        error: error.message,
        memoryId: id,
        userId: req.userId,
      });
      return res.status(500).json({
        error: "Failed to update memory",
        code: "UPDATE_FAILED",
      });
    }

    res.json({ data });
  } catch (error) {
    logger.error("Memory update error", {
      error: error.message,
      memoryId: req.params.id,
      userId: req.userId,
    });
    res.status(500).json({
      error: "Internal server error",
      code: "INTERNAL_ERROR",
    });
  }
});

// DELETE /api/v1/maas/memories/:id - Delete memory
// DELETE /api/v1/memory/:id - Delete memory
router.delete("/api/v1/memory/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = resolveOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({
        error: "Organization context required",
        code: "ORG_CONTEXT_REQUIRED",
      });
    }

    const { error } = await supabase
      .from("memory_entries")
      .delete()
      .eq("id", id)
      .eq("organization_id", organizationId)
      .eq("user_id", req.userId);

    if (error) {
      logger.error("Failed to delete memory", {
        error: error.message,
        memoryId: id,
        userId: req.userId,
      });
      return res.status(500).json({
        error: "Failed to delete memory",
        code: "DELETE_FAILED",
      });
    }

    res.status(204).send();
  } catch (error) {
    logger.error("Memory deletion error", {
      error: error.message,
      memoryId: req.params.id,
      userId: req.userId,
    });
    res.status(500).json({
      error: "Internal server error",
      code: "INTERNAL_ERROR",
    });
  }
});

// POST /api/v1/maas/memories/search - Semantic search
// POST /api/v1/memory/search - Semantic search
router.post("/api/v1/memory/search", async (req, res) => {
  try {
    const { query, limit = 10, similarity_threshold = 0.8 } = req.body;

    if (!query) {
      return res.status(400).json({
        error: "Search query is required",
        code: "VALIDATION_ERROR",
      });
    }

    const organizationId = resolveOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({
        error: "Organization context required",
        code: "ORG_CONTEXT_REQUIRED",
      });
    }

    // Generate embedding for search query
    let searchResults = [];

    if (process.env.OPENAI_API_KEY) {
      try {
        const embeddingResponse = await fetch(
          "https://api.openai.com/v1/embeddings",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "text-embedding-ada-002",
              input: query,
            }),
          }
        );

        if (embeddingResponse.ok) {
          const embeddingData = await embeddingResponse.json();
          const queryEmbedding = embeddingData.data[0].embedding;

          // Use RPC function for vector similarity search
          const { data, error } = await supabase.rpc("match_memories", {
            query_embedding: queryEmbedding,
            match_threshold: similarity_threshold,
            match_count: limit,
            p_user_id: req.userId,
            p_organization_id: organizationId,
          });

          if (!error) {
            searchResults = data;
          }
        }
      } catch (embeddingError) {
        logger.warn("Vector search failed, falling back to text search", {
          error: embeddingError.message,
        });
      }
    }

    // Fallback to text search if vector search fails
    if (searchResults.length === 0) {
      const { data, error } = await supabase
        .from("memory_entries")
        .select("*")
        .eq("user_id", req.userId)
        .eq("organization_id", organizationId)
        .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
        .limit(limit)
        .order("created_at", { ascending: false });

      if (!error) {
        searchResults = data;
      }
    }

    res.json({ data: searchResults });
  } catch (error) {
    logger.error("Memory search error", {
      error: error.message,
      userId: req.userId,
    });
    res.status(500).json({
      error: "Internal server error",
      code: "INTERNAL_ERROR",
    });
  }
});

// Organization Management Endpoints

// GET /api/v1/maas/organizations - Get user's organizations
router.get("/organizations", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("organizations")
      .select(
        `
        *,
        users!inner(user_id)
      `
      )
      .eq("users.user_id", req.userId);

    if (error) {
      logger.error("Failed to fetch organizations", {
        error: error.message,
        userId: req.userId,
      });
      return res.status(500).json({
        error: "Failed to fetch organizations",
        code: "FETCH_FAILED",
      });
    }

    res.json({ data });
  } catch (error) {
    logger.error("Organizations fetch error", {
      error: error.message,
      userId: req.userId,
    });
    res.status(500).json({
      error: "Internal server error",
      code: "INTERNAL_ERROR",
    });
  }
});

// API Keys Management (delegated to Core)

// POST /api/v1/maas/api-keys - Create API key via Core
router.post("/api-keys", async (req, res) => {
  try {
    const { name, permissions, expires_at } = req.body;

    // Call Core API key service
    const response = await fetch(
      `${process.env.CORE_API_BASE_URL}/api/v1/keys`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: req.headers.authorization,
          "x-project-scope": "maas",
        },
        body: JSON.stringify({
          name,
          permissions,
          expires_at,
          project_scope: "maas",
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        error: errorData.error || "Failed to create API key",
        code: "KEY_CREATE_FAILED",
      });
    }

    const data = await response.json();
    res.status(201).json(data);
  } catch (error) {
    logger.error("API key creation error", {
      error: error.message,
      userId: req.userId,
    });
    res.status(500).json({
      error: "Internal server error",
      code: "INTERNAL_ERROR",
    });
  }
});

// GET /api/v1/maas/api-keys - List API keys
router.get("/api-keys", async (req, res) => {
  try {
    const response = await fetch(
      `${process.env.CORE_API_BASE_URL}/api/v1/keys?project_scope=maas`,
      {
        method: "GET",
        headers: {
          Authorization: req.headers.authorization,
          "x-project-scope": "maas",
        },
      }
    );

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Failed to fetch API keys",
        code: "KEY_FETCH_FAILED",
      });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    logger.error("API key list error", {
      error: error.message,
      userId: req.userId,
    });
    res.status(500).json({
      error: "Internal server error",
      code: "INTERNAL_ERROR",
    });
  }
});

// Health check for MaaS module
router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "Onasis-CORE MaaS API",
    version: "1.0.0",
    project_scope: "maas",
    timestamp: new Date().toISOString(),
    capabilities: [
      "memory_management",
      "semantic_search",
      "organization_management",
      "api_key_delegation",
      "audit_logging",
    ],
  });
});

module.exports = router;
