#!/usr/bin/env node

/**
 * Foreign API Key Manager Service
 * Secure storage and management of vendor API keys for Onasis-CORE
 * Handles encryption, rotation, and dynamic key management
 */

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");
const winston = require("winston");
require("dotenv").config();

const app = express();
const PORT = process.env.KEY_MANAGER_PORT || 3003;

// Initialize logger
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  defaultMeta: { service: "onasis-key-manager" },
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY are required");
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Encryption setup
const ENCRYPTION_KEY =
  process.env.KEY_ENCRYPTION_SECRET || crypto.randomBytes(32);
const ALGORITHM = "aes-256-gcm";

// Rate limiting - Protect sensitive key operations
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 requests per window (stricter for key management)
  message: {
    error: "Too many requests",
    code: "RATE_LIMITED",
    retryAfter: "15 minutes",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === "/v1/keys/health", // Skip health checks
});

// Very strict limiter for key creation/rotation (prevent abuse)
const keyOperationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Only 10 key operations per hour
  message: {
    error: "Too many key operations",
    code: "KEY_OP_RATE_LIMITED",
    retryAfter: "1 hour",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware
app.use(helmet());
app.use(generalLimiter);
app.use(
  cors({
    origin: ["https://api.lanonasis.com", "http://localhost:3000"],
    credentials: true,
  }),
);
app.use(express.json());

// Apply strict limiter to sensitive key operations
app.use("/v1/keys/vendors", (req, res, next) => {
  if (
    req.method === "POST" ||
    req.method === "PUT" ||
    req.method === "DELETE"
  ) {
    return keyOperationLimiter(req, res, next);
  }
  next();
});
app.use("/v1/keys/vendors/:id/rotate", keyOperationLimiter);

// Encryption utilities
const encrypt = (text) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipher(ALGORITHM, ENCRYPTION_KEY);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  return {
    encrypted: encrypted,
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
  };
};

const decrypt = (encryptedData) => {
  const decipher = crypto.createDecipher(ALGORITHM, ENCRYPTION_KEY);
  decipher.setAuthTag(Buffer.from(encryptedData.authTag, "hex"));

  let decrypted = decipher.update(encryptedData.encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
};

// Authentication middleware
const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({
        error: "Authentication required",
        code: "AUTH_REQUIRED",
      });
    }

    // Validate token with Supabase Auth
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        error: "Invalid authentication token",
        code: "AUTH_INVALID",
      });
    }

    // Check if user has admin role
    if (user.user_metadata?.role !== "admin") {
      return res.status(403).json({
        error: "Admin access required",
        code: "ACCESS_DENIED",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error("Authentication error:", error);
    res.status(401).json({
      error: "Authentication failed",
      code: "AUTH_FAILED",
    });
  }
};

// Initialize database schema
const initializeSchema = async () => {
  try {
    const { error } = await supabase.rpc("create_vendor_keys_table", {});

    if (error && !error.message.includes("already exists")) {
      logger.error("Schema initialization failed:", error);
    } else {
      logger.info("Vendor keys schema initialized");
    }
  } catch (error) {
    logger.warn("Schema initialization warning:", error.message);
  }
};

// Routes

// GET /v1/keys/vendors - List all vendor keys
app.get("/v1/keys/vendors", authenticate, async (req, res) => {
  try {
    const { data: keys, error } = await supabase
      .from("vendor_api_keys")
      .select(
        "id, vendor_name, key_name, created_at, updated_at, last_used_at, is_active",
      )
      .eq("is_active", true)
      .order("vendor_name");

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      data: keys || [],
      count: keys?.length || 0,
    });
  } catch (error) {
    logger.error("Failed to list vendor keys:", error);
    res.status(500).json({
      error: "Failed to retrieve vendor keys",
      code: "LIST_FAILED",
    });
  }
});

// GET /v1/keys/vendors/:id - Get specific vendor key (decrypted)
app.get("/v1/keys/vendors/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: keyData, error } = await supabase
      .from("vendor_api_keys")
      .select("*")
      .eq("id", id)
      .eq("is_active", true)
      .single();

    if (error || !keyData) {
      return res.status(404).json({
        error: "Vendor key not found",
        code: "KEY_NOT_FOUND",
      });
    }

    // Decrypt the key for admin access
    const decryptedKey = decrypt(JSON.parse(keyData.encrypted_key));

    // Update last accessed time
    await supabase
      .from("vendor_api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", id);

    res.json({
      success: true,
      data: {
        ...keyData,
        decrypted_key: decryptedKey,
        encrypted_key: undefined, // Remove encrypted version from response
      },
    });
  } catch (error) {
    logger.error("Failed to get vendor key:", error);
    res.status(500).json({
      error: "Failed to retrieve vendor key",
      code: "GET_FAILED",
    });
  }
});

// POST /v1/keys/vendors - Add new vendor key
app.post("/v1/keys/vendors", authenticate, async (req, res) => {
  try {
    const { vendor_name, key_name, api_key, description } = req.body;

    if (!vendor_name || !key_name || !api_key) {
      return res.status(400).json({
        error: "vendor_name, key_name, and api_key are required",
        code: "VALIDATION_ERROR",
      });
    }

    // Encrypt the API key
    const encryptedData = encrypt(api_key);

    const keyRecord = {
      id: crypto.randomUUID(),
      vendor_name,
      key_name,
      encrypted_key: JSON.stringify(encryptedData),
      description: description || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_active: true,
    };

    const { data, error } = await supabase
      .from("vendor_api_keys")
      .insert([keyRecord])
      .select()
      .single();

    if (error) {
      throw error;
    }

    logger.info(`Vendor key created: ${vendor_name}/${key_name}`);

    res.status(201).json({
      success: true,
      data: {
        ...data,
        encrypted_key: undefined, // Don't return encrypted data
      },
    });
  } catch (error) {
    logger.error("Failed to create vendor key:", error);
    res.status(500).json({
      error: "Failed to create vendor key",
      code: "CREATE_FAILED",
    });
  }
});

// PUT /v1/keys/vendors/:id - Update vendor key
app.put("/v1/keys/vendors/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { key_name, api_key, description, is_active } = req.body;

    const updates = {
      updated_at: new Date().toISOString(),
    };

    if (key_name) updates.key_name = key_name;
    if (description !== undefined) updates.description = description;
    if (is_active !== undefined) updates.is_active = is_active;

    // Re-encrypt if new API key provided
    if (api_key) {
      const encryptedData = encrypt(api_key);
      updates.encrypted_key = JSON.stringify(encryptedData);
    }

    const { data, error } = await supabase
      .from("vendor_api_keys")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error || !data) {
      return res.status(404).json({
        error: "Vendor key not found",
        code: "KEY_NOT_FOUND",
      });
    }

    logger.info(`Vendor key updated: ${id}`);

    res.json({
      success: true,
      data: {
        ...data,
        encrypted_key: undefined,
      },
    });
  } catch (error) {
    logger.error("Failed to update vendor key:", error);
    res.status(500).json({
      error: "Failed to update vendor key",
      code: "UPDATE_FAILED",
    });
  }
});

// DELETE /v1/keys/vendors/:id - Soft delete vendor key
app.delete("/v1/keys/vendors/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("vendor_api_keys")
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error || !data) {
      return res.status(404).json({
        error: "Vendor key not found",
        code: "KEY_NOT_FOUND",
      });
    }

    logger.info(`Vendor key deactivated: ${id}`);

    res.json({
      success: true,
      message: "Vendor key deactivated successfully",
    });
  } catch (error) {
    logger.error("Failed to delete vendor key:", error);
    res.status(500).json({
      error: "Failed to delete vendor key",
      code: "DELETE_FAILED",
    });
  }
});

// POST /v1/keys/vendors/:id/rotate - Rotate vendor key
app.post("/v1/keys/vendors/:id/rotate", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { new_api_key } = req.body;

    if (!new_api_key) {
      return res.status(400).json({
        error: "new_api_key is required",
        code: "VALIDATION_ERROR",
      });
    }

    // Encrypt new key
    const encryptedData = encrypt(new_api_key);

    const { data, error } = await supabase
      .from("vendor_api_keys")
      .update({
        encrypted_key: JSON.stringify(encryptedData),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error || !data) {
      return res.status(404).json({
        error: "Vendor key not found",
        code: "KEY_NOT_FOUND",
      });
    }

    logger.info(`Vendor key rotated: ${id}`);

    res.json({
      success: true,
      message: "Vendor key rotated successfully",
      data: {
        ...data,
        encrypted_key: undefined,
      },
    });
  } catch (error) {
    logger.error("Failed to rotate vendor key:", error);
    res.status(500).json({
      error: "Failed to rotate vendor key",
      code: "ROTATE_FAILED",
    });
  }
});

// GET /v1/keys/health - Health check
app.get("/v1/keys/health", (req, res) => {
  res.json({
    status: "ok",
    service: "Onasis-CORE Key Manager",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    capabilities: [
      "vendor_key_storage",
      "key_encryption",
      "key_rotation",
      "admin_access_control",
    ],
  });
});

// Error handling middleware
app.use((error, req, res, _next) => {
  logger.error("Key Manager error:", error);

  res.status(500).json({
    error: "Internal key manager error",
    code: "KEY_MANAGER_ERROR",
  });
});

// Start server
const startServer = async () => {
  try {
    await initializeSchema();

    app.listen(PORT, () => {
      logger.info(`🔑 Onasis-CORE Key Manager running on port ${PORT}`);
      console.log(`🔐 Foreign API Key Manager: http://localhost:${PORT}`);
      console.log(`🛡️  Secure key storage: ENABLED`);
      console.log(`🔄 Key rotation: ENABLED`);
    });
  } catch (error) {
    logger.error("Failed to start Key Manager:", error);
    process.exit(1);
  }
};

startServer();

module.exports = app;
