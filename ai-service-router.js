#!/usr/bin/env node

/**
 * Onasis-CORE AI Service Router
 * Routes vendor requests to SD-Ghost Protocol AI services
 * Handles vendor authentication, billing, and AI service integration
 */

const fetch = require('node-fetch');
const winston = require('winston');
const VendorAuthManager = require('./vendor-auth-middleware');

class AIServiceRouter {
  constructor(config) {
    this.sdGhostVpsUrl = config.sdGhostVpsUrl || 'http://168.231.74.29:3000';
    this.sdGhostSupabaseUrl = config.sdGhostSupabaseUrl || 'https://mxtsdgkwzjzlttpotole.supabase.co';
    this.onasisSupabaseUrl = config.onasisSupabaseUrl;
    this.onasisServiceKey = config.onasisServiceKey;
    
    this.vendorAuth = new VendorAuthManager(
      this.onasisSupabaseUrl,
      this.onasisServiceKey
    );
    
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      defaultMeta: { service: 'ai-service-router' },
      transports: [
        new winston.transports.File({ filename: 'logs/ai-router.log' }),
        new winston.transports.Console()
      ]
    });
  }

  // Service mapping: Vendor service names → SD-Ghost Protocol endpoints
  getServiceMapping() {
    return {
      // AI Conversation Services
      'ai-chat': {
        type: 'supabase',
        endpoint: '/functions/v1/ai-chat',
        description: 'Multi-model AI conversations'
      },
      'chat': {
        type: 'supabase', 
        endpoint: '/functions/v1/ai-chat',
        description: 'AI chat conversations'
      },
      
      // Audio Services
      'text-to-speech': {
        type: 'supabase',
        endpoint: '/functions/v1/elevenlabs-tts',
        description: 'Text to speech conversion'
      },
      'speech-to-text': {
        type: 'supabase',
        endpoint: '/functions/v1/elevenlabs-stt', 
        description: 'Speech to text transcription'
      },
      'transcribe': {
        type: 'supabase',
        endpoint: '/functions/v1/whisper-transcribe',
        description: 'Advanced speech transcription'
      },
      
      // Content Processing
      'extract-tags': {
        type: 'supabase',
        endpoint: '/functions/v1/extract-tags',
        description: 'AI-powered content tagging'
      },
      'generate-summary': {
        type: 'supabase',
        endpoint: '/functions/v1/generate-summary',
        description: 'Content summarization'
      },
      'generate-embedding': {
        type: 'supabase',
        endpoint: '/functions/v1/generate-embedding',
        description: 'Vector embeddings generation'
      },
      
      // Memory Services (VPS Enhanced Memory Server)
      'memory-search': {
        type: 'vps',
        endpoint: '/api/memories/search',
        description: 'Semantic memory search'
      },
      'memory-create': {
        type: 'vps',
        endpoint: '/api/memories',
        description: 'Create memory entries'
      },
      'memory-chat': {
        type: 'vps',
        endpoint: '/api/chat',
        description: 'Memory-aware chat'
      },
      
      // Tool Integration
      'mcp-handler': {
        type: 'supabase',
        endpoint: '/functions/v1/mcp-handler',
        description: 'Tool integration and automation'
      },
      'integrations': {
        type: 'supabase',
        endpoint: '/functions/v1/mcp-handler',
        description: 'External tool integrations'
      }
    };
  }

  // Route request to appropriate SD-Ghost Protocol service
  async routeToAIService(req, res) {
    const startTime = Date.now();
    const { service } = req.params;
    const serviceMapping = this.getServiceMapping();
    const serviceConfig = serviceMapping[service];

    if (!serviceConfig) {
      return res.status(404).json({
        error: {
          message: `AI service '${service}' not found`,
          code: 'SERVICE_NOT_FOUND',
          available_services: Object.keys(serviceMapping)
        }
      });
    }

    try {
      let result;
      
      if (serviceConfig.type === 'vps') {
        result = await this.callVPSService(serviceConfig.endpoint, req);
      } else {
        result = await this.callSupabaseFunction(serviceConfig.endpoint, req);
      }

      const processingTime = Date.now() - startTime;

      // Extract usage data for billing
      const usage = this.extractUsageData(result, processingTime);
      
      // Log usage for vendor billing (async)
      setImmediate(() => {
        this.vendorAuth.logUsage(req, res, usage);
      });

      // Add Onasis branding and metadata
      const response = this.addOnasisBranding(result, {
        service,
        vendor_code: req.vendor?.vendor_code,
        processing_time: processingTime,
        ai_service_provider: 'sd-ghost-protocol'
      });

      res.json(response);

    } catch (error) {
      this.logger.error('AI service routing failed', {
        service,
        vendor_code: req.vendor?.vendor_code,
        error: error.message
      });

      res.status(500).json({
        error: {
          message: 'AI service temporarily unavailable',
          code: 'AI_SERVICE_ERROR',
          service: service
        }
      });
    }
  }

  // Call SD-Ghost Protocol VPS Enhanced Memory Server
  async callVPSService(endpoint, req) {
    const url = `${this.sdGhostVpsUrl}${endpoint}`;
    
    // Prepare request with SD-Ghost Protocol format
    const requestBody = {
      ...req.body,
      // Add vendor context for internal tracking
      _vendor_context: {
        vendor_code: req.vendor?.vendor_code,
        platform: req.platform?.domain,
        request_source: 'onasis-partnership'
      }
    };

    const response = await fetch(url, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Onasis-CORE/1.0',
        'X-Forwarded-For': req.ip,
        // Include SD-Ghost Protocol memory API key
        'Authorization': `Bearer ${process.env.SD_GHOST_MEMORY_API_KEY || 'sk_test_ghost_memory_2024_secure_api_key_v1'}`
      },
      body: req.method !== 'GET' ? JSON.stringify(requestBody) : undefined,
      timeout: 60000
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SD-Ghost VPS service error: ${response.status} - ${errorText}`);
    }

    return await response.json();
  }

  // Call SD-Ghost Protocol Supabase Edge Function
  async callSupabaseFunction(endpoint, req) {
    const url = `${this.sdGhostSupabaseUrl}${endpoint}`;
    
    // Prepare request for SD-Ghost Protocol
    const requestBody = {
      ...req.body,
      // Add vendor context
      _vendor_context: {
        vendor_code: req.vendor?.vendor_code,
        platform: req.platform?.domain,
        request_source: 'onasis-partnership'
      }
    };

    const response = await fetch(url, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SD_GHOST_SUPABASE_ANON_KEY}`,
        'apikey': process.env.SD_GHOST_SUPABASE_ANON_KEY,
        'User-Agent': 'Onasis-CORE/1.0'
      },
      body: req.method !== 'GET' ? JSON.stringify(requestBody) : undefined,
      timeout: 60000
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SD-Ghost Supabase function error: ${response.status} - ${errorText}`);
    }

    return await response.json();
  }

  // Extract usage data for billing
  extractUsageData(result, processingTime) {
    let tokens = 0;
    let computeUnits = 0;

    // Extract token usage from SD-Ghost Protocol response
    if (result.usage) {
      tokens = result.usage.total_tokens || result.usage.prompt_tokens + result.usage.completion_tokens || 0;
    }

    // Estimate compute units based on processing time and service type
    computeUnits = Math.ceil(processingTime / 1000 * 0.1); // 0.1 units per second

    return {
      processing_time: processingTime,
      tokens: tokens,
      compute_units: computeUnits,
      response_size: JSON.stringify(result).length
    };
  }

  // Add Onasis branding to response
  addOnasisBranding(result, metadata) {
    // Remove SD-Ghost Protocol specific branding
    if (result.provider) {
      delete result.provider;
    }

    // Add Onasis branding
    return {
      ...result,
      onasis_metadata: {
        service: metadata.service,
        vendor_code: metadata.vendor_code,
        processing_time: metadata.processing_time,
        ai_service_provider: metadata.ai_service_provider,
        powered_by: 'Onasis-CORE Partnership Platform',
        partner_api_version: '1.0.0',
        timestamp: new Date().toISOString()
      }
    };
  }

  // Get available AI services for a vendor
  getAvailableServices(vendorPermissions) {
    const allServices = this.getServiceMapping();
    const availableServices = {};

    Object.entries(allServices).forEach(([serviceName, config]) => {
      // Check if vendor has permission for this service
      if (!vendorPermissions.allowed_services || 
          vendorPermissions.allowed_services[serviceName] === true) {
        availableServices[serviceName] = {
          description: config.description,
          endpoint: `/api/${serviceName}`,
          type: config.type
        };
      }
    });

    return availableServices;
  }

  // Health check for AI services
  async checkAIServicesHealth() {
    const health = {
      sd_ghost_vps: { status: 'unknown', response_time: null },
      sd_ghost_supabase: { status: 'unknown', response_time: null }
    };

    // Check VPS Enhanced Memory Server
    try {
      const startTime = Date.now();
      const vpsResponse = await fetch(`${this.sdGhostVpsUrl}/health`, { timeout: 10000 });
      health.sd_ghost_vps = {
        status: vpsResponse.ok ? 'healthy' : 'unhealthy',
        response_time: Date.now() - startTime,
        details: vpsResponse.ok ? await vpsResponse.json() : null
      };
    } catch (error) {
      health.sd_ghost_vps = {
        status: 'error',
        response_time: null,
        error: error.message
      };
    }

    // Check Supabase Functions (test with a simple function)
    try {
      const startTime = Date.now();
      const supabaseResponse = await fetch(`${this.sdGhostSupabaseUrl}/functions/v1/generate-summary`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.SD_GHOST_SUPABASE_ANON_KEY}`,
          'apikey': process.env.SD_GHOST_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content: 'test' }),
        timeout: 10000
      });
      
      health.sd_ghost_supabase = {
        status: supabaseResponse.ok ? 'healthy' : 'unhealthy',
        response_time: Date.now() - startTime
      };
    } catch (error) {
      health.sd_ghost_supabase = {
        status: 'error',
        response_time: null,
        error: error.message
      };
    }

    return health;
  }

  // Express routes for AI service integration
  getRoutes() {
    const express = require('express');
    const router = express.Router();

    // AI service routing
    router.use('/api/:service',
      this.vendorAuth.authenticateVendor,
      this.vendorAuth.trackUsage,
      (req, res) => this.routeToAIService(req, res)
    );

    // Service discovery
    router.get('/ai-services', 
      this.vendorAuth.authenticateVendor,
      (req, res) => {
        const services = this.getAvailableServices(req.vendor);
        res.json({
          available_services: services,
          vendor_code: req.vendor.vendor_code,
          ai_provider: 'SD-Ghost Protocol',
          total_services: Object.keys(services).length
        });
      }
    );

    // AI services health check
    router.get('/ai-health', async (req, res) => {
      const health = await this.checkAIServicesHealth();
      res.json({
        ai_services_health: health,
        overall_status: Object.values(health).every(s => s.status === 'healthy') ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString()
      });
    });

    return router;
  }
}

module.exports = AIServiceRouter;