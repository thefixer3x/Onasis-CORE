const { Handler } = require("@netlify/functions");

// Main API Gateway function for Onasis-CORE
exports.handler = async (event, context) => {
  try {
    const { httpMethod, path, headers, body, queryStringParameters } = event;

    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-Vendor, X-API-Key, x-project-scope",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "X-Powered-By": "Onasis-CORE",
      "X-Privacy-Level": "High",
      "Content-Type": "application/json",
    };

    // Handle CORS preflight
    if (httpMethod === "OPTIONS") {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: "",
      };
    }

    // Parse request body
    let requestBody = {};
    if (body) {
      try {
        requestBody = JSON.parse(body);
      } catch (e) {
        requestBody = {};
      }
    }

    // Route based on path
    const response = await routeRequest(
      path,
      httpMethod,
      headers,
      requestBody,
      queryStringParameters
    );

    return {
      statusCode: response.statusCode || 200,
      headers: {
        ...corsHeaders,
        ...response.headers,
      },
      body: JSON.stringify(response.body),
    };
  } catch (error) {
    console.error("API Gateway error:", error);

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        error: {
          message: "Internal gateway error",
          type: "gateway_error",
          code: "INTERNAL_ERROR",
        },
        request_id: generateRequestId(),
      }),
    };
  }
};

// Request router
async function routeRequest(path, method, headers, body, query) {
  const requestId = generateRequestId();

  // Health check endpoint
  if (path === "/health" || path.endsWith("/health")) {
    return {
      statusCode: 200,
      body: {
        status: "ok",
        service: "Onasis-CORE API Gateway",
        version: "1.0.0",
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        privacy_level: "high",
        features: [
          "vendor_masking",
          "client_anonymization",
          "request_sanitization",
          "billing_integration",
          "rate_limiting",
        ],
        request_id: requestId,
      },
    };
  }

  // Service info endpoint
  if (path === "/info" || path.endsWith("/info")) {
    return {
      statusCode: 200,
      body: {
        service: "Onasis-CORE",
        description: "Privacy-First Infrastructure Services Platform",
        capabilities: [
          "API Gateway with Privacy Protection",
          "Data Masking and Anonymization",
          "Email Proxy Services",
          "Anonymous Billing and Tracking",
          "Webhook Privacy Routing",
        ],
        endpoints: {
          chat: "/api/v1/chat/completions",
          completions: "/api/v1/completions",
          embeddings: "/api/v1/embeddings",
          models: "/api/v1/models",
          auth: "/v1/auth",
        },
        privacy_policy: "https://onasis.io/privacy",
        terms_of_service: "https://onasis.io/terms",
        request_id: requestId,
      },
    };
  }

  // Chat completions endpoint
  if (path.includes("/chat/completions") && method === "POST") {
    return {
      statusCode: 501,
      body: {
        error: {
          message:
            "Chat completions endpoint not implemented in serverless mode",
          type: "not_implemented",
          code: "CHAT_NOT_IMPLEMENTED",
        },
        request_id: requestId,
      },
    };
  }

  // Models endpoint
  if (path.includes("/models") && method === "GET") {
    return {
      statusCode: 200,
      body: {
        object: "list",
        data: [
          {
            id: "onasis-chat-advanced",
            object: "model",
            created: 1677610602,
            owned_by: "onasis-core",
            permission: [],
            root: "onasis-chat-advanced",
            parent: null,
            description: "Advanced chat model with privacy protection",
          },
          {
            id: "onasis-completion-fast",
            object: "model",
            created: 1677610602,
            owned_by: "onasis-core",
            permission: [],
            root: "onasis-completion-fast",
            parent: null,
            description: "Fast completion model with anonymization",
          },
        ],
      },
    };
  }

  // OAuth endpoints - Pattern 1: /oauth/* (original)
  // Pattern 2: /api/v1/oauth/* (CLI compatible)
  if (path.match(/\/(api\/v1\/)?oauth\/(authorize|token|revoke|introspect)/)) {
    // Extract the OAuth endpoint
    const oauthEndpoint = path.match(/oauth\/(\w+)/)[1];

    // OAuth endpoints require backend service
    // These should be proxied to auth-gateway service
    return {
      statusCode: 501,
      body: {
        error: {
          message: `OAuth ${oauthEndpoint} endpoint requires backend service deployment`,
          type: "not_implemented",
          code: "OAUTH_BACKEND_REQUIRED",
          note: "OAuth PKCE flow requires stateful backend service",
          backend_service: "auth-gateway (port 4000)",
          deployment_status: "pending",
        },
        available_patterns: [
          `/oauth/${oauthEndpoint}`,
          `/api/v1/oauth/${oauthEndpoint}`,
        ],
        documentation: "https://docs.lanonasis.com/oauth",
        request_id: requestId,
      },
    };
  }

  // Authentication endpoints are handled by dedicated auth-api function
  // This catch-all should not interfere with /v1/auth/* routes

  // Default 404 response
  return {
    statusCode: 404,
    body: {
      error: {
        message: "Endpoint not found",
        type: "not_found",
        code: "ENDPOINT_NOT_FOUND",
      },
      available_endpoints: [
        "/health",
        "/info",
        "/api/v1/models",
        "/api/v1/memory",
        "/api/v1/memory/:id",
        "/api/v1/memory/search",
        "/api/v1/memory/stats",
        "/v1/auth",
        "/oauth/authorize",
        "/oauth/token",
        "/api/v1/oauth/authorize",
        "/api/v1/oauth/token",
      ],
      documentation: "https://docs.lanonasis.com/cli",
      request_id: requestId,
    },
  };
}

// Generate anonymous request ID
function generateRequestId() {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
}
