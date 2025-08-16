#!/usr/bin/env node

/**
 * Onasis-CORE Control Room
 * Single Source of Truth - Master Dashboard for All Platforms
 * Real-time monitoring, analytics, and management across the entire ecosystem
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const WebSocket = require('ws');
const http = require('http');
const fetch = require('node-fetch');
const crypto = require('crypto');
const winston = require('winston');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const PORT = process.env.CONTROL_ROOM_PORT || 4000;

// Control Room logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'onasis-control-room' },
  transports: [
    new winston.transports.File({ filename: 'logs/control-room.log' }),
    new winston.transports.Console({ format: winston.format.simple() })
  ]
});

// Platform endpoints to monitor
const MONITORED_PLATFORMS = {
  'saas.seftec.tech': {
    name: 'Seftec SaaS',
    health_url: 'https://saas.seftec.tech/health',
    api_base: 'https://saas.seftec.tech/api',
    color: '#2563eb',
    priority: 'high'
  },
  'seftechub.com': {
    name: 'SeftecHub',
    health_url: 'https://seftechub.com/health',
    api_base: 'https://seftechub.com/api',
    color: '#059669',
    priority: 'high'
  },
  'vortexcore.app': {
    name: 'VortexCore',
    health_url: 'https://vortexcore.app/health',
    api_base: 'https://vortexcore.app/api',
    color: '#dc2626',
    priority: 'critical'
  },
  'lanonasis.com': {
    name: 'LanOnasis',
    health_url: 'https://lanonasis.com/health',
    api_base: 'https://lanonasis.com/api',
    color: '#7c3aed',
    priority: 'medium'
  },
  'maas.lanonasis.com': {
    name: 'MaaS',
    health_url: 'https://maas.lanonasis.com/health',
    api_base: 'https://maas.lanonasis.com/api',
    color: '#ea580c',
    priority: 'critical'
  }
};

// Supabase configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  logger.error('Missing required Supabase configuration. Please set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.');
  process.exit(1);
}
if (!SUPABASE_SERVICE_KEY) {
  logger.warn('SUPABASE_SERVICE_KEY not set: /v1/auth/signup will be disabled until provided.');
}

// Real-time data store
let platformStatus = {};
let systemMetrics = {
  total_requests: 0,
  total_revenue: 0,
  active_users: 0,
  error_rate: 0,
  avg_response_time: 0,
  last_updated: new Date().toISOString()
};

// Security middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false
}));

app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:4000',
    'http://localhost:8080',
    'http://localhost:5173',
    'https://control.lanonasis.com',
    'https://api.lanonasis.com',
    'https://dashboard.lanonasis.com'
  ],
  credentials: true
}));

app.use(express.json());
// Accept URL-encoded form posts (for cross-origin redirects without fetch)
app.use(express.urlencoded({ extended: false }));
app.use(express.static('control-room/public'));

// -----------------------------
// Centralized Auth Gateway (/v1/auth/*)
// -----------------------------

// One-time code store (short-lived, single-use)
const CODE_TTL_MS = parseInt(process.env.AUTH_CODE_TTL_MS || '120000', 10); // default 2 minutes
const codeStore = new Map();

const generateCode = () => {
  return crypto.randomBytes(24).toString('base64url');
};

const saveCode = ({ refresh_token, user }, redirectTo) => {
  const code = generateCode();
  const now = Date.now();
  const record = {
    code,
    refresh_token,
    user,
    redirect_to: redirectTo || null,
    used: false,
    created_at: now,
    expires_at: now + CODE_TTL_MS
  };
  codeStore.set(code, record);
  return record;
};

// Purge expired codes periodically
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of codeStore.entries()) {
    if (v.expires_at <= now || v.used) codeStore.delete(k);
  }
}, Math.min(CODE_TTL_MS, 60000));

// Audit logger -> core.log_event (best-effort)
async function logAudit({ req, action, target, status = 'allowed', meta = {}, userId = null }) {
  if (!SUPABASE_SERVICE_KEY) {
    logger.debug('Audit skipped: service key missing', { action, target, status });
    return;
  }
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/log_event`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        apikey: SUPABASE_SERVICE_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        p_project: 'onasis-core',
        p_user_id: userId,
        p_action: action,
        p_target: target,
        p_status: status,
        p_meta: meta,
        p_ip_address: req?.ip || null,
        p_user_agent: req?.get('user-agent') || null,
        p_project_scope: null
      })
    });
  } catch (e) {
    logger.warn('Audit log failed', { error: e.message, action, target, status });
  }
}

// Supabase Auth helpers (REST)
async function adminCreateUser({ email, password, user_metadata }) {
  if (!SUPABASE_SERVICE_KEY) {
    throw new Error('Service key not configured');
  }
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      apikey: SUPABASE_SERVICE_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, password, user_metadata })
  });
  if (!res.ok) throw new Error(`Signup failed (${res.status})`);
  return res.json();
}

async function signInWithPassword({ email, password }) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) throw new Error('Invalid credentials');
  return res.json();
}

async function refreshSession({ refresh_token }) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ refresh_token })
  });
  if (!res.ok) throw new Error(`Refresh failed (${res.status})`);
  return res.json();
}

async function getUserByAccessToken(accessToken) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: SUPABASE_ANON_KEY
    }
  });
  if (!res.ok) throw new Error(`getUser failed (${res.status})`);
  return res.json();
}

async function signOutByAccessToken(accessToken) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: SUPABASE_ANON_KEY
    }
  });
  if (!res.ok) throw new Error(`logout failed (${res.status})`);
}

// Input guard
function requireFields(obj, fields) {
  for (const f of fields) {
    if (!obj || typeof obj[f] === 'undefined' || obj[f] === null || obj[f] === '') return f;
  }
  return null;
}

// Routes
app.post('/v1/auth/signup', async (req, res) => {
  if (!SUPABASE_SERVICE_KEY) {
    await logAudit({ req, action: 'auth_signup', target: 'auth', status: 'denied', meta: { reason: 'service_key_missing' } });
    return res.status(503).json({ error: 'Service unavailable', code: 'SERVICE_KEY_MISSING' });
  }
  const missing = requireFields(req.body, ['email', 'password']);
  if (missing) {
    return res.status(400).json({ error: 'Invalid request', code: 'BAD_REQUEST' });
  }
  const { email, password, user_metadata } = req.body;
  try {
    const created = await adminCreateUser({ email, password, user_metadata });
    await logAudit({ req, action: 'auth_signup', target: 'auth', status: 'allowed', meta: { email: 'redacted' }, userId: created?.user?.id || null });
    return res.status(201).json({ success: true });
  } catch (e) {
    await logAudit({ req, action: 'auth_signup', target: 'auth', status: 'error', meta: { reason: 'signup_failed' } });
    return res.status(400).json({ error: 'Unable to create account', code: 'SIGNUP_FAILED' });
  }
});

app.post('/v1/auth/login', async (req, res) => {
  const missing = requireFields(req.body, ['email', 'password']);
  if (missing) {
    return res.status(400).json({ error: 'Invalid request', code: 'BAD_REQUEST' });
  }
  const { email, password, redirect_to, state } = req.body;
  try {
    const session = await signInWithPassword({ email, password });
    const record = saveCode({ refresh_token: session.refresh_token, user: session.user }, redirect_to);
    await logAudit({ req, action: 'auth_login', target: 'auth', status: 'allowed', meta: { code_issued: true } , userId: session.user?.id || null });

    if (redirect_to) {
      const url = new URL(redirect_to);
      url.searchParams.set('code', record.code);
      if (state) url.searchParams.set('state', state);
      return res.redirect(302, url.toString());
    }
    return res.json({ code: record.code, expires_in: Math.floor(CODE_TTL_MS / 1000) });
  } catch (e) {
    await logAudit({ req, action: 'auth_login', target: 'auth', status: 'denied', meta: { reason: 'invalid_credentials' } });
    return res.status(401).json({ error: 'Invalid credentials', code: 'UNAUTHORIZED' });
  }
});

app.post('/v1/auth/exchange', async (req, res) => {
  const missing = requireFields(req.body, ['code']);
  if (missing) return res.status(400).json({ error: 'Invalid request', code: 'BAD_REQUEST' });
  const { code } = req.body;
  const record = codeStore.get(code);
  const now = Date.now();
  if (!record || record.used || record.expires_at <= now) {
    await logAudit({ req, action: 'auth_exchange', target: 'auth', status: 'denied', meta: { reason: 'invalid_or_expired_code' } });
    return res.status(400).json({ error: 'Invalid or expired code', code: 'INVALID_CODE' });
  }
  try {
    const refreshed = await refreshSession({ refresh_token: record.refresh_token });
    record.used = true;
    codeStore.set(code, record);
    await logAudit({ req, action: 'auth_exchange', target: 'auth', status: 'allowed', meta: { code_used: true }, userId: refreshed.user?.id || record.user?.id || null });
    return res.json({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expires_in: refreshed.expires_in,
      token_type: refreshed.token_type || 'bearer',
      user: refreshed.user || record.user || null
    });
  } catch (e) {
    await logAudit({ req, action: 'auth_exchange', target: 'auth', status: 'error', meta: { reason: 'refresh_failed' } });
    return res.status(400).json({ error: 'Exchange failed', code: 'EXCHANGE_FAILED' });
  }
});

app.post('/v1/auth/refresh', async (req, res) => {
  const missing = requireFields(req.body, ['refresh_token']);
  if (missing) return res.status(400).json({ error: 'Invalid request', code: 'BAD_REQUEST' });
  try {
    const refreshed = await refreshSession({ refresh_token: req.body.refresh_token });
    await logAudit({ req, action: 'auth_refresh', target: 'auth', status: 'allowed', userId: refreshed.user?.id || null });
    return res.json(refreshed);
  } catch (e) {
    await logAudit({ req, action: 'auth_refresh', target: 'auth', status: 'denied', meta: { reason: 'invalid_refresh' } });
    return res.status(400).json({ error: 'Refresh failed', code: 'REFRESH_FAILED' });
  }
});

app.get('/v1/auth/user', async (req, res) => {
  const auth = req.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
  try {
    const user = await getUserByAccessToken(token);
    await logAudit({ req, action: 'auth_user', target: 'auth', status: 'allowed', userId: user?.id || null });
    return res.json({ user });
  } catch (e) {
    await logAudit({ req, action: 'auth_user', target: 'auth', status: 'denied' });
    return res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
  }
});

app.post('/v1/auth/logout', async (req, res) => {
  const auth = req.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(200).json({ success: true });
  try {
    await signOutByAccessToken(token);
    await logAudit({ req, action: 'auth_logout', target: 'auth', status: 'allowed' });
    return res.json({ success: true });
  } catch (e) {
    await logAudit({ req, action: 'auth_logout', target: 'auth', status: 'error' });
    return res.json({ success: true });
  }
});

// WebSocket connection handling
wss.on('connection', (ws) => {
  logger.info('Control room client connected');
  
  // Send initial data
  ws.send(JSON.stringify({
    type: 'initial_data',
    platform_status: platformStatus,
    system_metrics: systemMetrics
  }));
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      handleControlRoomMessage(ws, data);
    } catch (error) {
      logger.error('WebSocket message error', { error: error.message });
    }
  });
  
  ws.on('close', () => {
    logger.info('Control room client disconnected');
  });
});

// Handle control room messages
const handleControlRoomMessage = (ws, data) => {
  switch (data.type) {
    case 'get_platform_details':
      getPlatformDetails(ws, data.platform);
      break;
    case 'restart_platform':
      restartPlatform(ws, data.platform);
      break;
    case 'get_analytics':
      getAnalytics(ws, data.timeframe);
      break;
    case 'execute_command':
      executeCommand(ws, data.command, data.target);
      break;
    default:
      ws.send(JSON.stringify({ type: 'error', message: 'Unknown command' }));
  }
};

// Monitor platform health
const monitorPlatforms = async () => {
  const promises = Object.entries(MONITORED_PLATFORMS).map(async ([domain, config]) => {
    try {
      const startTime = Date.now();
      const response = await fetch(config.health_url, { timeout: 10000 });
      const responseTime = Date.now() - startTime;
      
      let data = {};
      try {
        data = await response.json();
      } catch (e) {
        data = { status: response.ok ? 'ok' : 'error' };
      }
      
      platformStatus[domain] = {
        name: config.name,
        status: response.ok ? 'healthy' : 'unhealthy',
        response_time: responseTime,
        last_check: new Date().toISOString(),
        priority: config.priority,
        color: config.color,
        details: data,
        uptime: data.uptime || 0,
        version: data.version || 'unknown'
      };
      
    } catch (error) {
      platformStatus[domain] = {
        name: config.name,
        status: 'error',
        response_time: null,
        last_check: new Date().toISOString(),
        priority: config.priority,
        color: config.color,
        error: error.message,
        uptime: 0
      };
    }
  });
  
  await Promise.all(promises);
  
  // Broadcast updates to all connected clients
  const updateMessage = JSON.stringify({
    type: 'platform_update',
    platform_status: platformStatus,
    timestamp: new Date().toISOString()
  });
  
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(updateMessage);
    }
  });
};

// Get system analytics
const getSystemAnalytics = async () => {
  try {
    // Fetch usage data from Supabase
    const response = await fetch(`${SUPABASE_URL}/rest/v1/usage_logs?select=*&order=timestamp.desc&limit=1000`, {
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'apikey': SUPABASE_SERVICE_KEY
      }
    });
    
    if (response.ok) {
      const usageData = await response.json();
      
      // Calculate metrics
      const totalRequests = usageData.length;
      const successfulRequests = usageData.filter(log => log.success).length;
      const errorRate = totalRequests > 0 ? ((totalRequests - successfulRequests) / totalRequests * 100) : 0;
      const avgResponseTime = usageData.length > 0 ? 
        usageData.reduce((sum, log) => sum + (log.response_time || 0), 0) / usageData.length : 0;
      
      // Group by platform
      const platformMetrics = {};
      usageData.forEach(log => {
        if (!platformMetrics[log.platform]) {
          platformMetrics[log.platform] = {
            requests: 0,
            errors: 0,
            total_response_time: 0
          };
        }
        platformMetrics[log.platform].requests++;
        if (!log.success) platformMetrics[log.platform].errors++;
        platformMetrics[log.platform].total_response_time += log.response_time || 0;
      });
      
      systemMetrics = {
        total_requests: totalRequests,
        total_revenue: totalRequests * 0.01, // Simplified revenue calculation
        active_users: new Set(usageData.map(log => log.user_id)).size,
        error_rate: Math.round(errorRate * 100) / 100,
        avg_response_time: Math.round(avgResponseTime),
        platform_breakdown: platformMetrics,
        last_updated: new Date().toISOString()
      };
    }
  } catch (error) {
    logger.error('Failed to fetch analytics', { error: error.message });
  }
};

// Control Room API endpoints
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Onasis-CORE Control Room',
    version: '1.0.0',
    monitored_platforms: Object.keys(MONITORED_PLATFORMS).length,
    connected_clients: wss.clients.size,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

app.get('/dashboard', (req, res) => {
  res.json({
    platform_status: platformStatus,
    system_metrics: systemMetrics,
    monitored_platforms: MONITORED_PLATFORMS,
    real_time_data: {
      connected_clients: wss.clients.size,
      last_health_check: Object.values(platformStatus)[0]?.last_check || null
    }
  });
});

app.get('/analytics/:timeframe', async (req, res) => {
  try {
    const { timeframe } = req.params;
    let startDate = new Date();
    
    switch (timeframe) {
      case '1h':
        startDate.setHours(startDate.getHours() - 1);
        break;
      case '24h':
        startDate.setDate(startDate.getDate() - 1);
        break;
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      default:
        startDate.setDate(startDate.getDate() - 1);
    }
    
    const response = await fetch(`${SUPABASE_URL}/rest/v1/usage_logs?select=*&timestamp=gte.${startDate.toISOString()}&order=timestamp.desc`, {
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'apikey': SUPABASE_SERVICE_KEY
      }
    });
    
    const data = await response.json();
    
    // Process analytics data
    const analytics = {
      timeframe,
      total_requests: data.length,
      unique_users: new Set(data.map(log => log.user_id)).size,
      platform_distribution: {},
      service_distribution: {},
      hourly_breakdown: [],
      error_analysis: {}
    };
    
    // Group by platform and service
    data.forEach(log => {
      analytics.platform_distribution[log.platform] = 
        (analytics.platform_distribution[log.platform] || 0) + 1;
      analytics.service_distribution[log.service] = 
        (analytics.service_distribution[log.service] || 0) + 1;
      
      if (!log.success) {
        analytics.error_analysis[log.platform] = 
          (analytics.error_analysis[log.platform] || 0) + 1;
      }
    });
    
    res.json(analytics);
    
  } catch (error) {
    logger.error('Analytics fetch failed', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

app.post('/command/:platform', async (req, res) => {
  try {
    const { platform } = req.params;
    const { action, parameters } = req.body;
    
    logger.info('Control room command', { platform, action, parameters });
    
    // Execute platform-specific commands
    let result;
    switch (action) {
      case 'restart':
        result = await restartPlatformService(platform);
        break;
      case 'scale':
        result = await scalePlatform(platform, parameters.instances);
        break;
      case 'deploy':
        result = await deployToplatform(platform, parameters.version);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }
    
    res.json({
      success: true,
      platform,
      action,
      result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Command execution failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Platform management functions
const restartPlatformService = async (platform) => {
  // Simulate platform restart - replace with actual implementation
  logger.info(`Restarting platform: ${platform}`);
  return { message: `Platform ${platform} restart initiated` };
};

const scalePlatform = async (platform, instances) => {
  logger.info(`Scaling platform ${platform} to ${instances} instances`);
  return { message: `Platform ${platform} scaled to ${instances} instances` };
};

const deployToplatform = async (platform, version) => {
  logger.info(`Deploying version ${version} to platform ${platform}`);
  return { message: `Version ${version} deployed to ${platform}` };
};

// Serve control room dashboard
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Onasis-CORE Control Room</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #0f172a;
            color: #e2e8f0;
            overflow-x: hidden;
        }
        .header {
            background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
            padding: 1rem 2rem;
            border-bottom: 1px solid #334155;
        }
        .header h1 {
            color: #f1f5f9;
            font-size: 1.5rem;
            font-weight: 600;
        }
        .header .subtitle {
            color: #94a3b8;
            font-size: 0.875rem;
            margin-top: 0.25rem;
        }
        .dashboard {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 1.5rem;
            padding: 2rem;
        }
        .card {
            background: #1e293b;
            border: 1px solid #334155;
            border-radius: 0.75rem;
            padding: 1.5rem;
            transition: all 0.3s ease;
        }
        .card:hover {
            border-color: #475569;
            transform: translateY(-2px);
        }
        .card h3 {
            color: #f1f5f9;
            font-size: 1.125rem;
            margin-bottom: 1rem;
        }
        .platform-status {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0.75rem;
            background: #334155;
            border-radius: 0.5rem;
            margin-bottom: 0.75rem;
        }
        .status-indicator {
            width: 0.75rem;
            height: 0.75rem;
            border-radius: 50%;
            margin-right: 0.75rem;
        }
        .status-healthy { background-color: #10b981; }
        .status-unhealthy { background-color: #ef4444; }
        .status-error { background-color: #f59e0b; }
        .metric {
            display: flex;
            justify-content: space-between;
            padding: 0.5rem 0;
            border-bottom: 1px solid #334155;
        }
        .metric:last-child { border-bottom: none; }
        .metric-value {
            color: #60a5fa;
            font-weight: 600;
        }
        .real-time-indicator {
            display: inline-block;
            width: 0.5rem;
            height: 0.5rem;
            background-color: #10b981;
            border-radius: 50%;
            margin-left: 0.5rem;
            animation: pulse 2s infinite;
        }
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
        .controls {
            grid-column: 1 / -1;
            display: flex;
            gap: 1rem;
            flex-wrap: wrap;
        }
        .btn {
            background: #3b82f6;
            color: white;
            border: none;
            padding: 0.75rem 1.5rem;
            border-radius: 0.5rem;
            cursor: pointer;
            font-weight: 500;
            transition: background 0.3s ease;
        }
        .btn:hover { background: #2563eb; }
        .btn-danger { background: #ef4444; }
        .btn-danger:hover { background: #dc2626; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🎛️ Onasis-CORE Control Room</h1>
        <div class="subtitle">Single Source of Truth • Real-time Monitoring • Multi-Platform Management</div>
    </div>
    
    <div class="dashboard">
        <div class="card">
            <h3>Platform Status <span class="real-time-indicator"></span></h3>
            <div id="platform-status">
                <div class="platform-status">
                    <div style="display: flex; align-items: center;">
                        <div class="status-indicator status-healthy"></div>
                        Connecting to platforms...
                    </div>
                </div>
            </div>
        </div>
        
        <div class="card">
            <h3>System Metrics</h3>
            <div id="system-metrics">
                <div class="metric">
                    <span>Total Requests</span>
                    <span class="metric-value" id="total-requests">-</span>
                </div>
                <div class="metric">
                    <span>Active Users</span>
                    <span class="metric-value" id="active-users">-</span>
                </div>
                <div class="metric">
                    <span>Error Rate</span>
                    <span class="metric-value" id="error-rate">-</span>
                </div>
                <div class="metric">
                    <span>Avg Response Time</span>
                    <span class="metric-value" id="avg-response-time">-</span>
                </div>
                <div class="metric">
                    <span>Total Revenue</span>
                    <span class="metric-value" id="total-revenue">-</span>
                </div>
            </div>
        </div>
        
        <div class="card">
            <h3>Quick Actions</h3>
            <div class="controls">
                <button class="btn" onclick="refreshAll()">🔄 Refresh All</button>
                <button class="btn" onclick="viewAnalytics()">📊 Analytics</button>
                <button class="btn btn-danger" onclick="emergencyMode()">🚨 Emergency</button>
            </div>
        </div>
    </div>
    
    <script>
        const ws = new WebSocket('ws://localhost:${PORT}');
        
        ws.onopen = () => {
            console.log('Connected to Control Room');
        };
        
        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            handleControlRoomUpdate(data);
        };
        
        function handleControlRoomUpdate(data) {
            switch (data.type) {
                case 'initial_data':
                case 'platform_update':
                    updatePlatformStatus(data.platform_status);
                    if (data.system_metrics) {
                        updateSystemMetrics(data.system_metrics);
                    }
                    break;
            }
        }
        
        function updatePlatformStatus(platforms) {
            const container = document.getElementById('platform-status');
            container.innerHTML = '';
            
            Object.entries(platforms).forEach(([domain, platform]) => {
                const statusClass = 'status-' + (platform.status === 'healthy' ? 'healthy' : 
                                                platform.status === 'error' ? 'error' : 'unhealthy');
                
                container.innerHTML += \`
                    <div class="platform-status">
                        <div style="display: flex; align-items: center;">
                            <div class="status-indicator \${statusClass}"></div>
                            <div>
                                <div>\${platform.name}</div>
                                <div style="font-size: 0.75rem; color: #94a3b8;">\${domain}</div>
                            </div>
                        </div>
                        <div style="text-align: right; font-size: 0.875rem;">
                            <div>\${platform.response_time ? platform.response_time + 'ms' : 'N/A'}</div>
                            <div style="color: #94a3b8;">\${platform.status}</div>
                        </div>
                    </div>
                \`;
            });
        }
        
        function updateSystemMetrics(metrics) {
            document.getElementById('total-requests').textContent = metrics.total_requests.toLocaleString();
            document.getElementById('active-users').textContent = metrics.active_users.toLocaleString();
            document.getElementById('error-rate').textContent = metrics.error_rate + '%';
            document.getElementById('avg-response-time').textContent = metrics.avg_response_time + 'ms';
            document.getElementById('total-revenue').textContent = '$' + metrics.total_revenue.toFixed(2);
        }
        
        function refreshAll() {
            ws.send(JSON.stringify({ type: 'refresh_all' }));
        }
        
        function viewAnalytics() {
            window.open('/analytics/24h', '_blank');
        }
        
        function emergencyMode() {
            if (confirm('Activate emergency mode? This will implement safety protocols.')) {
                ws.send(JSON.stringify({ type: 'emergency_mode' }));
            }
        }
    </script>
</body>
</html>
  `);
});

// Start monitoring intervals
setInterval(monitorPlatforms, 30000); // Every 30 seconds
setInterval(getSystemAnalytics, 60000); // Every minute

// Initial monitoring
monitorPlatforms();
getSystemAnalytics();

// Start server
server.listen(PORT, '0.0.0.0', () => {
  logger.info('Control Room started', {
    port: PORT,
    monitored_platforms: Object.keys(MONITORED_PLATFORMS).length
  });
  
  console.log(`🎛️  Onasis-CORE Control Room running on port ${PORT}`);
  console.log(`🌍 Monitoring ${Object.keys(MONITORED_PLATFORMS).length} platforms:`);
  Object.entries(MONITORED_PLATFORMS).forEach(([domain, config]) => {
    console.log(`   • ${config.name} (${domain}) - Priority: ${config.priority}`);
  });
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
  console.log(`🏥 Health: http://localhost:${PORT}/health`);
});

module.exports = { app, server };