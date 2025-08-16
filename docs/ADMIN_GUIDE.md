# Onasis-CORE Admin Guide

**Advanced Administration & Partnership Management** 🛡️

---

## 🎯 **Executive Summary**

Onasis-CORE is your **enterprise-grade partnership orchestration platform** managing 5 distinct branded platforms while providing seamless integration with SD-Ghost Protocol's AI services. This guide covers advanced administration, vendor management, and system monitoring.

### **Key Architecture**
- **Partnership Layer**: Vendor management, billing, privacy gateway
- **AI Service Layer**: Routes to SD-Ghost Protocol (VPS + Supabase)
- **Control Room**: Real-time monitoring across all platforms
- **Security Model**: Multi-layered authentication with RLS

---

## 🏗️ **System Architecture**

### **Core Components**

#### **1. Multi-Platform Router** (`multi-platform-router.js`)
- **Purpose**: Unified API gateway for all 5 platforms
- **Features**: Platform detection, rate limiting, authentication
- **Platforms Managed**:
  - `saas.seftec.tech` - Enterprise SaaS (Subscription tiers)
  - `seftechub.com` - Developer Hub (Usage-based billing)
  - `vortexcore.app` - AI/ML Platform (Token consumption)
  - `lanonasis.com` - Privacy Communication (Freemium)
  - `maas.onasis.io` - Models as a Service (Compute hours)

#### **2. Vendor Authentication System** (`vendor-auth-middleware.js`)
- **Purpose**: Secure vendor API key management
- **Features**: Supabase-powered authentication, RLS, usage tracking
- **API Key Format**: `pk_live_VENDOR_CODE_abc123.sk_live_secret_key_xyz789`

#### **3. AI Service Router** (`ai-service-router.js`)
- **Purpose**: Routes vendor requests to SD-Ghost Protocol
- **Integration Points**: 
  - VPS Enhanced Memory Server (`168.231.74.29:3000`)
  - Supabase Edge Functions (`your-project.supabase.co`)

#### **4. Control Room Dashboard** (`control-room/dashboard.js`)
- **Purpose**: Real-time monitoring and analytics
- **Features**: WebSocket updates, platform health, vendor management

---

## 🔧 **System Configuration**

### **Environment Variables**

#### **Core Configuration**
```bash
# Router Settings
ROUTER_PORT=3000
JWT_SECRET=onasis_multi_platform_secret_2024

# Onasis-CORE Supabase (Partnership Management)
ONASIS_SUPABASE_URL=https://your-onasis-project.supabase.co
ONASIS_SUPABASE_SERVICE_KEY=your_service_key
ONASIS_SUPABASE_ANON_KEY=your_anon_key

# SD-Ghost Protocol Integration
SD_GHOST_VPS_URL=http://your-vps-ip:3000
SD_GHOST_SUPABASE_URL=https://your-sd-ghost-project.supabase.co
SD_GHOST_SUPABASE_ANON_KEY=your_sd_ghost_anon_key
SD_GHOST_MEMORY_API_KEY=your_memory_api_key
```

#### **Production Deployment**
```bash
# Security
NODE_ENV=production
CORS_ORIGIN=https://your-domains.com
HELMET_ENABLED=true
RATE_LIMIT_MAX=1000

# Monitoring
LOG_LEVEL=info
WINSTON_LOG_FILE=logs/onasis-core.log
METRICS_ENABLED=true
```

---

## 👥 **Vendor Management**

### **Vendor Organization Structure**

#### **Database Schema**
```sql
-- Core vendor organization
CREATE TABLE vendor_organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendor_code VARCHAR(20) UNIQUE NOT NULL,
    organization_name VARCHAR(255) NOT NULL,
    organization_type VARCHAR(50) DEFAULT 'business',
    contact_email VARCHAR(255) NOT NULL,
    contact_name VARCHAR(255),
    billing_tier VARCHAR(50) DEFAULT 'starter',
    platform_access JSONB DEFAULT '[]'::jsonb,
    service_permissions JSONB DEFAULT '{}'::jsonb,
    rate_limit INTEGER DEFAULT 100,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- API key management
CREATE TABLE vendor_api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendor_org_id UUID REFERENCES vendor_organizations(id),
    key_id VARCHAR(100) UNIQUE NOT NULL,
    key_secret_hash VARCHAR(255) NOT NULL,
    key_name VARCHAR(255) DEFAULT 'API Key',
    key_type VARCHAR(20) DEFAULT 'live',
    environment VARCHAR(20) DEFAULT 'production',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    last_used_at TIMESTAMP
);

-- Usage tracking
CREATE TABLE vendor_usage_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendor_org_id UUID REFERENCES vendor_organizations(id),
    api_key_id UUID REFERENCES vendor_api_keys(id),
    request_id VARCHAR(100),
    platform VARCHAR(100),
    service VARCHAR(100),
    processing_time_ms INTEGER,
    tokens_consumed INTEGER DEFAULT 0,
    status_code INTEGER,
    success BOOLEAN,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### **Vendor Creation Process**

#### **1. Create New Vendor Organization**
```bash
POST /admin/vendors
{
  "organization_name": "Acme Corp",
  "organization_type": "enterprise",
  "contact_email": "admin@acme.com",
  "contact_name": "John Doe",
  "platform_access": ["saas.seftec.tech", "vortexcore.app"],
  "billing_tier": "professional",
  "service_permissions": {
    "ai-chat": true,
    "embeddings": true,
    "text-to-speech": false
  }
}
```

#### **2. Generate API Keys**
```bash
POST /admin/vendors/{vendorId}/api-keys
{
  "key_name": "Production API Key",
  "key_type": "live",
  "environment": "production"
}
```

#### **Response Format**
```json
{
  "success": true,
  "vendor": {
    "id": "uuid",
    "vendor_code": "ACME_A1B2C3",
    "organization_name": "Acme Corp"
  },
  "api_key": {
    "api_key": "pk_live_ACME_A1B2C3.sk_live_secret_key_xyz789",
    "key_id": "pk_live_ACME_A1B2C3",
    "key_name": "Production API Key",
    "environment": "production"
  }
}
```

---

## 🎛️ **Control Room Operations**

### **Real-time Monitoring**

#### **Platform Health Dashboard**
```javascript
// Real-time platform status
const MONITORED_PLATFORMS = {
  'saas.seftec.tech': { 
    name: 'Seftec SaaS', 
    priority: 'high',
    health_endpoint: '/health',
    expected_response_time: 200
  },
  'vortexcore.app': { 
    name: 'VortexCore', 
    priority: 'critical',
    health_endpoint: '/health',
    expected_response_time: 150
  }
};

// Key metrics tracked
const METRICS = {
  requests_per_minute: 0,
  average_response_time: 0,
  error_rate: 0,
  active_vendors: 0,
  platform_uptime: {},
  ai_service_health: {}
};
```

#### **Vendor Activity Monitoring**
```javascript
// Real-time vendor usage
const vendorMetrics = {
  total_requests: 15420,
  successful_requests: 14967,
  failed_requests: 453,
  average_processing_time: 234,
  top_services: ['ai-chat', 'embeddings', 'tts'],
  platform_distribution: {
    'saas.seftec.tech': 45,
    'vortexcore.app': 35,
    'lanonasis.com': 20
  }
};
```

### **AI Service Integration Monitoring**

#### **SD-Ghost Protocol Health Checks**
```javascript
// VPS Enhanced Memory Server
const vpsHealth = {
  endpoint: 'http://168.231.74.29:3000/health',
  status: 'healthy',
  response_time: 89,
  available_services: ['memory-search', 'memory-create', 'memory-chat'],
  last_check: '2024-07-06T10:30:00Z'
};

// Supabase Edge Functions
const supabaseHealth = {
  endpoint: 'https://your-project.supabase.co/functions/v1',
  status: 'healthy',
  response_time: 156,
  available_functions: ['ai-chat', 'elevenlabs-tts', 'generate-embedding'],
  last_check: '2024-07-06T10:30:00Z'
};
```

---

## 💰 **Billing & Revenue Management**

### **Billing Models by Platform**

#### **Subscription Tiers (Seftec SaaS)**
```json
{
  "starter": {
    "monthly_fee": 29,
    "included_requests": 1000,
    "overage_rate": 0.01
  },
  "professional": {
    "monthly_fee": 99,
    "included_requests": 5000,
    "overage_rate": 0.008
  },
  "enterprise": {
    "monthly_fee": 299,
    "included_requests": 25000,
    "overage_rate": 0.005
  }
}
```

#### **Usage-Based Billing (SeftecHub)**
```json
{
  "api_calls": 0.001,
  "data_transfer_gb": 0.10,
  "compute_minutes": 0.05,
  "storage_gb_month": 0.023
}
```

#### **Token Consumption (VortexCore)**
```json
{
  "gpt_4_tokens": 0.015,
  "gpt_3_5_tokens": 0.002,
  "embedding_tokens": 0.0001,
  "custom_model_tokens": 0.020
}
```

### **Revenue Analytics**

#### **Monthly Revenue Breakdown**
```javascript
const revenueAnalytics = {
  total_monthly_revenue: 156789.50,
  platform_breakdown: {
    'saas.seftec.tech': 78394.25,
    'vortexcore.app': 45623.75,
    'seftechub.com': 23456.50,
    'lanonasis.com': 6789.00,
    'maas.onasis.io': 2526.00
  },
  vendor_distribution: {
    enterprise_clients: 125000.00,
    professional_clients: 25000.00,
    starter_clients: 6789.50
  },
  growth_metrics: {
    month_over_month: 12.5,
    new_vendors_this_month: 23,
    churned_vendors: 2
  }
};
```

---

## 🔐 **Security & Compliance**

### **Authentication Flow**

#### **Vendor API Key Validation**
```javascript
// 1. Parse API key
const [keyId, keySecret] = apiKey.split('.');
// Format: pk_live_VENDOR_CODE_abc123.sk_live_secret_key_xyz789

// 2. Validate with Supabase RPC
const validation = await supabase.rpc('validate_vendor_api_key', {
  p_key_id: keyId,
  p_key_secret: keySecret
});

// 3. Check permissions
const platformAccess = validation.allowed_platforms;
const servicePermissions = validation.allowed_services;

// 4. Apply rate limiting
const rateLimit = validation.rate_limit;
```

#### **Row Level Security (RLS) Policies**
```sql
-- Vendors can only access their own data
CREATE POLICY "Vendors access own data" ON vendor_usage_logs
FOR ALL USING (vendor_org_id = current_setting('app.vendor_org_id')::uuid);

-- API keys are only accessible to their owner
CREATE POLICY "API keys access control" ON vendor_api_keys
FOR ALL USING (vendor_org_id = current_setting('app.vendor_org_id')::uuid);
```

### **Privacy Protection**

#### **Data Anonymization**
```javascript
// Request anonymization
const anonymizedRequest = {
  request_id: crypto.randomBytes(16).toString('hex'),
  vendor_context: {
    vendor_code: req.vendor.vendor_code,
    // Real vendor identity hidden from AI services
    anonymized_id: crypto.createHash('sha256')
      .update(req.vendor.org_id)
      .digest('hex')
      .substring(0, 16)
  }
};
```

#### **Audit Logging**
```javascript
// Comprehensive audit trail
const auditLog = {
  event_type: 'vendor_api_call',
  vendor_code: 'ACME_A1B2C3',
  platform: 'saas.seftec.tech',
  service: 'ai-chat',
  request_id: 'req_12345',
  success: true,
  processing_time: 234,
  timestamp: '2024-07-06T10:30:00Z',
  ip_address: '192.168.1.100', // (hashed in production)
  user_agent: 'Onasis-SDK/1.0'
};
```

---

## 📊 **Performance Optimization**

### **Rate Limiting Strategy**

#### **Platform-Specific Limits**
```javascript
const rateLimits = {
  'saas.seftec.tech': {
    enterprise: 2000, // requests per minute
    professional: 1000,
    starter: 500
  },
  'vortexcore.app': {
    enterprise: 1500,
    professional: 750,
    starter: 300
  }
};
```

#### **Service-Specific Limits**
```javascript
const serviceLimits = {
  'ai-chat': { rpm: 100, burst: 10 },
  'embeddings': { rpm: 500, burst: 50 },
  'text-to-speech': { rpm: 200, burst: 20 }
};
```

### **Caching Strategy**

#### **Response Caching**
```javascript
// Cache frequently requested data
const cacheConfig = {
  vendor_info: { ttl: 300, type: 'memory' },
  platform_health: { ttl: 30, type: 'redis' },
  usage_summaries: { ttl: 900, type: 'redis' }
};
```

---

## 🚨 **Troubleshooting Guide**

### **Common Issues**

#### **1. Vendor Authentication Failures**
```bash
# Check API key format
curl -H "Authorization: Bearer pk_live_VENDOR_CODE.sk_live_secret" \
  https://saas.seftec.tech/api/ai-chat

# Expected error responses
{
  "error": {
    "code": "INVALID_KEY_FORMAT",
    "message": "API key must be in format pk_live_xxx.sk_live_xxx"
  }
}
```

#### **2. Platform Access Denied**
```json
{
  "error": {
    "code": "PLATFORM_ACCESS_DENIED",
    "message": "Vendor not authorized for platform: vortexcore.app",
    "allowed_platforms": ["saas.seftec.tech", "seftechub.com"]
  }
}
```

#### **3. AI Service Integration Issues**
```bash
# Check SD-Ghost Protocol health
curl http://your-vps-ip:3000/health

# Check Supabase functions
curl https://your-project.supabase.co/functions/v1/ai-chat \
  -H "Authorization: Bearer YOUR_SUPABASE_ANON_KEY"
```

### **Health Check Endpoints**

#### **System Health**
```bash
# Main router health
GET /health

# Platform-specific health
GET /platforms

# AI services health
GET /ai-health

# Vendor management health
GET /admin/health
```

---

## 🔄 **Maintenance & Updates**

### **Database Maintenance**

#### **Regular Maintenance Tasks**
```sql
-- Clean up old usage logs (monthly)
DELETE FROM vendor_usage_logs 
WHERE created_at < NOW() - INTERVAL '90 days';

-- Update vendor statistics
REFRESH MATERIALIZED VIEW vendor_monthly_stats;

-- Optimize query performance
ANALYZE vendor_usage_logs;
REINDEX INDEX idx_vendor_usage_logs_created_at;
```

### **System Updates**

#### **Zero-Downtime Deployment**
```bash
# 1. Deploy new version to staging
pm2 start ecosystem.staging.config.js

# 2. Run health checks
curl https://staging.onasis.io/health

# 3. Blue-green deployment
pm2 reload ecosystem.production.config.js

# 4. Verify all platforms
for platform in saas.seftec.tech vortexcore.app; do
  curl -f https://$platform/health || exit 1
done
```

---

## 📈 **Scaling Considerations**

### **Horizontal Scaling**

#### **Load Balancer Configuration**
```nginx
upstream onasis_backend {
    server 127.0.0.1:3000;
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;
}

server {
    listen 80;
    server_name saas.seftec.tech vortexcore.app;
    
    location / {
        proxy_pass http://onasis_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

#### **Database Scaling**
```sql
-- Read replicas for analytics
CREATE DATABASE onasis_analytics_replica;

-- Partitioning for usage logs
CREATE TABLE vendor_usage_logs_2024_07 PARTITION OF vendor_usage_logs
FOR VALUES FROM ('2024-07-01') TO ('2024-08-01');
```

---

## 🎯 **Success Metrics**

### **Key Performance Indicators**

#### **Operational Metrics**
- **Uptime**: 99.9% across all platforms
- **Response Time**: < 200ms average
- **Error Rate**: < 0.1% of requests
- **Vendor Satisfaction**: > 4.5/5

#### **Business Metrics**
- **Monthly Recurring Revenue**: $156,789
- **Vendor Growth Rate**: 12.5% MoM
- **Platform Utilization**: 85% average
- **API Success Rate**: 99.5%

#### **Technical Metrics**
- **Request Throughput**: 1,000 req/min peak
- **Data Processing**: 100GB/month
- **AI Service Latency**: < 2s average
- **Cache Hit Rate**: 85%

---

## 📚 **Additional Resources**

### **Documentation**
- [Architecture Overview](./architecture-separation.md)
- [User Guide](./USER_GUIDE.md)
- [API Reference](./API_REFERENCE.md)
- [Security Guide](./SECURITY_GUIDE.md)

### **Support Channels**
- **Admin Support**: admin@onasis.io
- **Technical Issues**: tech@onasis.io
- **Emergency Hotline**: +1-800-ONASIS-1
- **Status Page**: https://status.onasis.io

### **Monitoring Tools**
- **Grafana Dashboard**: https://grafana.onasis.io
- **Logs**: https://logs.onasis.io
- **APM**: https://apm.onasis.io
- **Alerts**: Slack #onasis-alerts

---

**Admin Power at Your Fingertips** 🚀

*This guide provides complete administrative control over your Onasis-CORE partnership ecosystem. Use these tools to maintain operational excellence and drive business growth.*

---

*Last updated: July 2024 • Version 1.0.0 • Admin Guide*