#!/usr/bin/env node
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const crypto = require('crypto');
const winston = require('winston');
const { SERVICE_ROUTES } = require('./config/routes.config');
const { routeToSupabase } = require('./supabase-router');

require('dotenv').config();

const app = express();
const ENABLE = process.env.ENABLE_UNIFIED_ROUTER === 'true';
const PORT = process.env.ROUTER_PORT || 4000;

// Logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'onasis-unified-router' },
  transports: [
    new winston.transports.Console({ format: winston.format.simple() })
  ]
});

if (!ENABLE) {
  logger.info('Unified Router is disabled via ENABLE_UNIFIED_ROUTER flag. Exiting.');
  // Export app for tests but don't start server
  module.exports = app;
  return;
}

app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true }
}));

app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Service','X-Vendor','X-API-Key']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Privacy middleware
app.use((req, res, next) => {
  req.anonymousId = crypto.randomBytes(16).toString('hex');
  req.timestamp = Date.now();
  delete req.headers['x-real-ip'];
  delete req.headers['x-forwarded-for'];
  delete req.headers['x-forwarded-host'];
  delete req.headers['cf-connecting-ip'];
  delete req.headers['x-forwarded-proto'];
  req.clientFingerprint = crypto.createHash('sha256')
    .update(req.headers['user-agent'] || '')
    .update(req.headers['accept-language'] || '')
    .digest('hex').substring(0,12);
  res.setHeader('X-Powered-By', 'Onasis-CORE');
  res.setHeader('X-Privacy-Level', 'High');
  res.setHeader('X-Request-ID', req.anonymousId);
  next();
});

// Health
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Onasis-CORE Unified Router',
    version: '1.0.0',
    uptime: Math.floor(process.uptime()),
    supabase_url_set: !!process.env.SUPABASE_URL=https://<project-ref>.supabase.co
    available_services: Object.keys(SERVICE_ROUTES),
    privacy_level: 'high',
    timestamp: new Date().toISOString()
  });
});

// Services discovery
app.get('/services', (req, res) => {
  const services = Object.entries(SERVICE_ROUTES).map(([name, cfg]) => ({
    name,
    endpoint: `/api/${name}`,
    description: cfg.description,
    methods: ['GET','POST','PUT','DELETE'],
    privacy_protected: true
  }));
  res.json({ available_services: services, total_count: services.length });
});

// Dynamic service routing
app.use('/api/:service', async (req, res) => {
  const serviceName = req.params.service;
  const serviceConfig = SERVICE_ROUTES[serviceName];
  if (!serviceConfig) {
    return res.status(404).json({ error: { message: `Service '${serviceName}' not found`, code: 'INVALID_SERVICE' }, available_services: Object.keys(SERVICE_ROUTES), request_id: req.anonymousId });
  }

  try {
    const result = await routeToSupabase(req, serviceName, serviceConfig.path, logger);
    res.json(result);
  } catch (err) {
    logger.error('Routing failure', { error: err.message, requestId: req.anonymousId });
    res.status(502).json({ error: { message: 'Service temporarily unavailable', code: 'ROUTING_FAILURE' }, request_id: req.anonymousId });
  }
});

// Webhook forwarding
app.post('/webhook/:service', async (req, res) => {
  const serviceName = req.params.service;
  if (!SERVICE_ROUTES[serviceName]) return res.status(404).json({ success: false, error: 'Webhook service not found' });
  try {
    const result = await routeToSupabase(req, serviceName, SERVICE_ROUTES[serviceName].path, logger);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('Router error', { requestId: req.anonymousId, error: err.message, stack: err.stack });
  res.status(500).json({ error: { message: 'Internal router error', code: 'INTERNAL_ERROR' }, request_id: req.anonymousId });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  logger.info('Onasis-CORE Unified Router started', { port: PORT, supabase_url: process.env.SUPABASE_URL=https://<project-ref>.supabase.co
});

module.exports = app;

