#!/usr/bin/env node

/**
 * Onasis-CORE API Gateway
 * Privacy-Protecting API Gateway for Sub-Selling Services
 * Masks vendor and client identities while proxying API requests
 */

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const crypto = require('crypto');
const fetch = require('node-fetch');
const winston = require('winston');
require('dotenv').config();

const app = express();
const PORT = process.env.GATEWAY_PORT || 3001;

// Enhanced logging with privacy protection
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'onasis-api-gateway' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Enhanced middleware for privacy protection
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// Allowed origins for CORS
const allowedOrigins = [
  'http://localhost:3000',  // Local development
  'http://localhost:5173',  // Vite dev server
  'http://localhost:8080',  // Alternative dev server
  'https://lanonasis.com',  // Production domain
  'https://api.lanonasis.com',  // API domain
  'https://dashboard.lanonasis.com',  // Dashboard domain
  'https://maas.lanonasis.com',  // MaaS specific domain
  'https://memory.lanonasis.com',  // Memory service domain
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // Log anonymized origin for security monitoring
      const hashedOrigin = crypto.createHash('sha256').update(origin).digest('hex').substring(0, 12);
      logger.warn(`Request from non-allowed origin: ${hashedOrigin}`);
      callback(null, true); // Still allow but log for monitoring
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Vendor', 'X-API-Key', 'x-project-scope']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting with anonymous tracking
const createRateLimit = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  message: { error: message, code: 'RATE_LIMIT_EXCEEDED' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  keyGenerator: (req) => {
    // Generate anonymous session key instead of using IP
    const sessionId = req.headers['x-session-id'] || 
                     req.headers['authorization']?.substring(0, 20) || 
                     req.headers['x-api-key']?.substring(0, 20) ||
                     'anonymous';
    return crypto.createHash('sha256').update(sessionId).digest('hex').substring(0, 16);
  }
});

// Different rate limits for different endpoints
const chatRateLimit = createRateLimit(60 * 1000, 100, 'Chat API rate limit exceeded');
const generalRateLimit = createRateLimit(60 * 1000, 200, 'General API rate limit exceeded');
const healthRateLimit = createRateLimit(60 * 1000, 1000, 'Health check rate limit exceeded');

// Privacy protection middleware
const privacyProtection = (req, res, next) => {
  // Generate anonymous request ID
  req.anonymousId = crypto.randomBytes(16).toString('hex');
  req.timestamp = Date.now();
  
  // Strip identifying headers
  delete req.headers['x-real-ip'];
  delete req.headers['x-forwarded-for'];
  delete req.headers['x-forwarded-host'];
  delete req.headers['cf-connecting-ip'];
  delete req.headers['x-forwarded-proto'];
  
  // Generate client fingerprint for analytics (non-identifying)
  req.clientFingerprint = crypto.createHash('sha256')
    .update(req.headers['user-agent'] || '')
    .update(req.headers['accept-language'] || '')
    .update(req.headers['accept-encoding'] || '')
    .digest('hex').substring(0, 12);
  
  // Add Onasis branding headers
  res.setHeader('X-Powered-By', 'Onasis-CORE');
  res.setHeader('X-Privacy-Level', 'High');
  res.setHeader('X-Request-ID', req.anonymousId);
  
  // Log anonymized request
  logger.info('Anonymous request processed', {
    requestId: req.anonymousId,
    clientFingerprint: req.clientFingerprint,
    endpoint: req.path,
    method: req.method,
    timestamp: req.timestamp
  });
  
  next();
};

app.use(privacyProtection);

// Vendor API configuration with Supabase integration
const VENDOR_CONFIGS = {
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    apiKey: process.env.OPENAI_API_KEY,
    rateLimit: { requests: 3500, window: 60000 },
    cost: { input: 0.0015, output: 0.002 } // per 1K tokens
  },
  anthropic: {
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    authHeader: 'x-api-key',
    authPrefix: '',
    apiKey: process.env.ANTHROPIC_API_KEY,
    additionalHeaders: {
      'anthropic-version': '2023-06-01'
    },
    rateLimit: { requests: 1000, window: 60000 },
    cost: { input: 0.008, output: 0.024 }
  },
  perplexity: {
    name: 'Perplexity',
    baseUrl: 'https://api.perplexity.ai',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    apiKey: process.env.PERPLEXITY_API_KEY,
    rateLimit: { requests: 500, window: 60000 },
    cost: { input: 0.001, output: 0.002 }
  },
  custom: {
    name: 'Custom Vendor',
    baseUrl: process.env.CUSTOM_VENDOR_URL,
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    apiKey: process.env.CUSTOM_VENDOR_KEY,
    rateLimit: { requests: 1000, window: 60000 },
    cost: { input: 0.001, output: 0.001 }
  }
};

// Utility functions for privacy protection
const sanitizeRequest = (body) => {
  const sanitized = JSON.parse(JSON.stringify(body));
  
  // Remove potential PII fields
  const piiFields = [
    'user_id', 'email', 'ip_address', 'session_id', 'phone', 'address',
    'name', 'firstname', 'lastname', 'ssn', 'credit_card', 'passport'
  ];
  
  const removePII = (obj) => {
    if (typeof obj === 'object' && obj !== null) {
      for (const field of piiFields) {
        delete obj[field];
      }
      for (const key in obj) {
        if (typeof obj[key] === 'object') {
          removePII(obj[key]);
        }
      }
    }
  };
  
  removePII(sanitized);
  return sanitized;
};

const sanitizeResponse = (data, vendor) => {
  const sanitized = JSON.parse(JSON.stringify(data));
  
  // Remove vendor-specific identifiers
  delete sanitized.model_version;
  delete sanitized.provider_id;
  delete sanitized.internal_request_id;
  delete sanitized.organization;
  delete sanitized.processing_ms;
  
  // Replace vendor branding with Onasis branding
  if (sanitized.model) {
    sanitized.model = sanitized.model
      .replace(/gpt-|claude-|palm-|llama-/, 'onasis-')
      .replace(/openai|anthropic|google|meta/, 'onasis');
  }
  
  // Add Onasis metadata
  sanitized.provider = 'onasis-core';
  sanitized.privacy_level = 'high';
  
  return sanitized;
};

// Enhanced proxy function with billing integration
const proxyToVendor = async (req, vendor, endpoint) => {
  const config = VENDOR_CONFIGS[vendor];
  if (!config || !config.apiKey) {
    throw new Error(`Vendor ${vendor} not configured or API key missing`);
  }

  const url = `${config.baseUrl}${endpoint}`;
  const sanitizedBody = sanitizeRequest(req.body);
  const requestStartTime = Date.now();

  // Create anonymous headers for vendor request
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'Onasis-CORE/1.0',
    [config.authHeader]: `${config.authPrefix}${config.apiKey}`,
    ...config.additionalHeaders
  };

  logger.info('Proxying request to vendor', {
    requestId: req.anonymousId,
    vendor: vendor,
    endpoint: endpoint,
    bodySize: JSON.stringify(sanitizedBody).length
  });

  try {
    const response = await fetch(url, {
      method: req.method,
      headers,
      body: JSON.stringify(sanitizedBody),
      timeout: 30000 // 30 second timeout
    });

    const responseTime = Date.now() - requestStartTime;
    
    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Vendor API error', {
        requestId: req.anonymousId,
        vendor: vendor,
        status: response.status,
        error: errorText
      });
      throw new Error(`Vendor API error: ${response.status}`);
    }

    const data = await response.json();
    const sanitizedResponse = sanitizeResponse(data, vendor);

    // Calculate billing information (tokens/usage)
    const usage = data.usage || {};
    const inputTokens = usage.prompt_tokens || usage.input_tokens || 0;
    const outputTokens = usage.completion_tokens || usage.output_tokens || 0;
    const totalTokens = usage.total_tokens || inputTokens + outputTokens;

    // Calculate costs (markup applied)
    const inputCost = (inputTokens / 1000) * config.cost.input;
    const outputCost = (outputTokens / 1000) * config.cost.output;
    const vendorCost = inputCost + outputCost;
    const markup = parseFloat(process.env.MARKUP_PERCENTAGE || '25') / 100;
    const clientCost = vendorCost * (1 + markup);

    // Log for billing (anonymized)
    logger.info('Request completed with billing', {
      requestId: req.anonymousId,
      vendor: vendor,
      responseTime: responseTime,
      tokens: {
        input: inputTokens,
        output: outputTokens,
        total: totalTokens
      },
      cost: {
        vendor: vendorCost,
        client: clientCost,
        markup: markup
      }
    });

    return {
      success: true,
      data: sanitizedResponse,
      metadata: {
        vendor: 'onasis-core',
        response_time: responseTime,
        anonymous_id: req.anonymousId,
        usage: {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          total_tokens: totalTokens
        },
        billing: {
          cost: clientCost,
          currency: 'USD'
        }
      }
    };

  } catch (error) {
    logger.error('Proxy request failed', {
      requestId: req.anonymousId,
      vendor: vendor,
      error: error.message
    });
    throw error;
  }
};

// Import API modules
const maasApi = require('./modules/maas-api');
const authApi = require('./modules/auth-api');

// API Routes

// Mount Auth API under /v1/auth
app.use('/v1/auth', authApi);

// Mount MaaS API under /api/v1/maas
app.use('/api/v1/maas', maasApi);

// Health check
app.get('/health', healthRateLimit, (req, res) => {
  res.json({
    status: 'ok',
    service: 'Onasis-CORE API Gateway',
    version: '1.0.0',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    privacy_level: 'high',
    features: [
      'vendor_masking',
      'client_anonymization', 
      'request_sanitization',
      'billing_integration',
      'rate_limiting'
    ]
  });
});

// Service info endpoint
app.get('/info', generalRateLimit, (req, res) => {
  res.json({
    service: 'Onasis-CORE',
    description: 'Privacy-First Infrastructure Services Platform',
    capabilities: [
      'API Gateway with Privacy Protection',
      'Data Masking and Anonymization',
      'Email Proxy Services',
      'Anonymous Billing and Tracking',
      'Webhook Privacy Routing'
    ],
    endpoints: {
      chat: '/api/v1/chat/completions',
      completions: '/api/v1/completions',
      embeddings: '/api/v1/embeddings',
      models: '/api/v1/models'
    },
    privacy_policy: 'https://lanonasis.com/privacy',
    terms_of_service: 'https://lanonasis.com/terms'
  });
});

// Chat completions endpoint
app.post('/api/v1/chat/completions', chatRateLimit, async (req, res) => {
  try {
    const vendor = req.headers['x-vendor'] || 'openai';
    
    if (!VENDOR_CONFIGS[vendor]) {
      return res.status(400).json({ 
        error: 'Unsupported vendor',
        supported_vendors: Object.keys(VENDOR_CONFIGS),
        code: 'INVALID_VENDOR'
      });
    }

    const result = await proxyToVendor(req, vendor, '/chat/completions');
    
    res.json({
      ...result.data,
      onasis_metadata: result.metadata
    });

  } catch (error) {
    logger.error('Chat completion failed', {
      requestId: req.anonymousId,
      error: error.message
    });
    
    res.status(500).json({
      error: {
        message: 'Service temporarily unavailable',
        type: 'gateway_error',
        code: 'PROXY_FAILURE'
      },
      request_id: req.anonymousId
    });
  }
});

// Completions endpoint (for non-chat models)
app.post('/api/v1/completions', generalRateLimit, async (req, res) => {
  try {
    const vendor = req.headers['x-vendor'] || 'openai';
    const result = await proxyToVendor(req, vendor, '/completions');
    
    res.json({
      ...result.data,
      onasis_metadata: result.metadata
    });

  } catch (error) {
    logger.error('Completion failed', {
      requestId: req.anonymousId,
      error: error.message
    });
    
    res.status(500).json({
      error: {
        message: 'Service temporarily unavailable',
        type: 'gateway_error',
        code: 'PROXY_FAILURE'
      },
      request_id: req.anonymousId
    });
  }
});

// Embeddings endpoint
app.post('/api/v1/embeddings', generalRateLimit, async (req, res) => {
  try {
    const vendor = req.headers['x-vendor'] || 'openai';
    const result = await proxyToVendor(req, vendor, '/embeddings');
    
    res.json({
      ...result.data,
      onasis_metadata: result.metadata
    });

  } catch (error) {
    logger.error('Embeddings failed', {
      requestId: req.anonymousId,
      error: error.message
    });
    
    res.status(500).json({
      error: {
        message: 'Service temporarily unavailable',
        type: 'gateway_error', 
        code: 'PROXY_FAILURE'
      },
      request_id: req.anonymousId
    });
  }
});

// Models endpoint (return Onasis branded models)
app.get('/api/v1/models', generalRateLimit, (req, res) => {
  const models = [
    {
      id: 'onasis-chat-advanced',
      object: 'model',
      created: 1677610602,
      owned_by: 'onasis-core',
      permission: [],
      root: 'onasis-chat-advanced',
      parent: null,
      description: 'Advanced chat model with privacy protection'
    },
    {
      id: 'onasis-completion-fast',
      object: 'model',
      created: 1677610602,
      owned_by: 'onasis-core',
      permission: [],
      root: 'onasis-completion-fast',
      parent: null,
      description: 'Fast completion model with anonymization'
    },
    {
      id: 'onasis-embedding-secure',
      object: 'model',
      created: 1677610602,
      owned_by: 'onasis-core',
      permission: [],
      root: 'onasis-embedding-secure',
      parent: null,
      description: 'Secure embedding model with privacy by design'
    }
  ];

  res.json({
    object: 'list',
    data: models
  });
});

// Generic proxy endpoint for custom vendors
app.use('/api/v1/proxy/:vendor/*', generalRateLimit, async (req, res) => {
  try {
    const vendor = req.params.vendor;
    const endpoint = '/' + req.params[0];
    
    if (!VENDOR_CONFIGS[vendor]) {
      return res.status(400).json({
        error: 'Unsupported vendor for proxy',
        supported_vendors: Object.keys(VENDOR_CONFIGS)
      });
    }
    
    const result = await proxyToVendor(req, vendor, endpoint);
    res.json({
      ...result.data,
      onasis_metadata: result.metadata
    });

  } catch (error) {
    logger.error('Custom proxy failed', {
      requestId: req.anonymousId,
      vendor: req.params.vendor,
      error: error.message
    });
    
    res.status(500).json({
      error: {
        message: 'Proxy service unavailable',
        type: 'proxy_error',
        code: 'CUSTOM_PROXY_FAILURE'
      },
      request_id: req.anonymousId
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error('Gateway error', {
    requestId: req.anonymousId,
    error: error.message,
    stack: error.stack
  });
  
  res.status(500).json({
    error: {
      message: 'Internal gateway error',
      type: 'gateway_error',
      code: 'INTERNAL_ERROR'
    },
    request_id: req.anonymousId
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: {
      message: 'Endpoint not found',
      type: 'not_found',
      code: 'ENDPOINT_NOT_FOUND'
    },
    available_endpoints: [
      '/api/v1/chat/completions',
      '/api/v1/completions',
      '/api/v1/embeddings',
      '/api/v1/models',
      '/health',
      '/info'
    ],
    documentation: 'https://docs.lanonasis.com'
  });
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}, shutting down gracefully`);
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
app.listen(PORT, '0.0.0.0', () => {
  logger.info('Onasis-CORE API Gateway started', {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    privacy_level: 'high',
    features: ['vendor_masking', 'client_anonymization', 'billing_integration']
  });
  
  console.log(`🔒 Onasis-CORE API Gateway running on port ${PORT}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health`);
  console.log(`🔌 API endpoint: http://localhost:${PORT}/api/v1/`);
  console.log(`🛡️  Privacy protection: ENABLED`);
  console.log(`📊 Anonymized logging: ACTIVE`);
  console.log(`💰 Billing integration: ENABLED`);
});

module.exports = app;