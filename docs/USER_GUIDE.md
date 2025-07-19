# Onasis-CORE User Guide

**Welcome to the future of privacy-first platform management!** 🚀

## 🌟 **What is Onasis-CORE?**

Onasis-CORE is your **unified platform empire** that manages 5 distinct branded platforms while providing enterprise-grade vendor management, privacy protection, and AI service integration.

### **Your Platform Empire:**
- 🏢 **Seftec SaaS** (`saas.seftec.tech`) - Enterprise SaaS Platform
- 🛠️ **SeftecHub** (`seftechub.com`) - Developer Hub & Marketplace
- 🧠 **VortexCore** (`vortexcore.app`) - AI/ML Infrastructure Platform
- 🔒 **LanOnasis** (`lanonasis.com`) - Privacy-First Communication
- 🤖 **MaaS** (`maas.onasis.io`) - Models as a Service

---

## 🎯 **Quick Start Guide**

### **For Platform Users**

#### 1. **Choose Your Platform**
Each platform serves different needs:
- **Enterprise clients** → Seftec SaaS
- **Developers** → SeftecHub  
- **AI/ML teams** → VortexCore
- **Privacy-conscious users** → LanOnasis
- **AI researchers** → MaaS

#### 2. **Create Account**
```bash
# Register on any platform
POST https://saas.seftec.tech/auth/register
{
  "email": "user@company.com",
  "password": "secure_password",
  "name": "Your Name",
  "platform_preference": "saas.seftec.tech"
}
```

#### 3. **Access Services**
```bash
# Example: AI Chat on Seftec SaaS
POST https://saas.seftec.tech/api/ai-chat
Authorization: Bearer your_token
{
  "messages": [{"role": "user", "content": "Hello!"}],
  "model": "onasis-chat-advanced"
}
```

### **For Business Partners/Vendors**

#### 1. **Get Vendor Access**
Contact: `business@onasis.io` for vendor onboarding

#### 2. **Receive API Keys**
```bash
# Your vendor API key format
pk_live_VENDOR_CODE_abc123.sk_live_secret_key_xyz789
```

#### 3. **Start Integration**
```bash
# Use across any platform
curl -X POST https://vortexcore.app/api/ai-chat \
  -H "Authorization: Bearer pk_live_VENDOR_CODE_abc123.sk_live_secret_key_xyz789" \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "AI request"}]}'
```

---

## 🔌 **API Reference**

### **Authentication**
All platforms use unified authentication:

```javascript
// Login
const response = await fetch('https://api.vortexai.io/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'password123'
  })
});

const { access_token } = await response.json();
```

### **AI Services**
Available across all platforms:

```javascript
// AI Chat
const chatResponse = await fetch('https://saas.seftec.tech/api/ai-chat', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${access_token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    messages: [
      { role: 'user', content: 'Explain quantum computing' }
    ],
    model: 'onasis-chat-advanced'
  })
});

// Text-to-Speech
const ttsResponse = await fetch('https://lanonasis.com/api/text-to-speech', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${access_token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    text: 'Hello, this is a privacy-protected voice message',
    voice: 'aria'
  })
});

// Generate Embeddings
const embeddingResponse = await fetch('https://vortexcore.app/api/embeddings', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${access_token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    input: 'Text to convert to embeddings'
  })
});
```

### **Platform-Specific Features**

#### **Seftec SaaS** - Enterprise Features
```javascript
// Data Analytics
const analyticsResponse = await fetch('https://saas.seftec.tech/api/data-analytics', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${access_token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    dataset: 'sales_data',
    analysis_type: 'trends',
    period: '30d'
  })
});

// Automation Workflows
const automationResponse = await fetch('https://saas.seftec.tech/api/automation', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${access_token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    workflow_name: 'lead_processing',
    trigger: 'new_contact',
    actions: ['send_email', 'create_task', 'update_crm']
  })
});
```

#### **SeftecHub** - Developer Tools
```javascript
// API Gateway Management
const gatewayResponse = await fetch('https://seftechub.com/api/gateway', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${access_token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    endpoint: '/my-api/v1',
    methods: ['GET', 'POST'],
    rate_limit: 100,
    authentication: 'api_key'
  })
});

// SDK Generation
const sdkResponse = await fetch('https://seftechub.com/api/generate-sdk', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${access_token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    api_spec: 'openapi_3.0',
    languages: ['javascript', 'python', 'go'],
    package_name: 'my-api-client'
  })
});
```

#### **VortexCore** - AI/ML Operations
```javascript
// Vector Search
const searchResponse = await fetch('https://vortexcore.app/api/vector-search', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${access_token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    query: 'machine learning algorithms',
    top_k: 10,
    similarity_threshold: 0.8
  })
});

// Model Fine-tuning
const finetuneResponse = await fetch('https://vortexcore.app/api/fine-tune', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${access_token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    base_model: 'onasis-chat-advanced',
    training_data: 'dataset_id_12345',
    epochs: 3,
    learning_rate: 0.0001
  })
});
```

#### **LanOnasis** - Privacy Services
```javascript
// Encrypted Translation
const translateResponse = await fetch('https://lanonasis.com/api/translate', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${access_token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    text: 'Confidential business message',
    from: 'en',
    to: 'es',
    privacy_level: 'maximum'
  })
});

// Privacy Chat
const privateChatResponse = await fetch('https://lanonasis.com/api/privacy-chat', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${access_token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    messages: [
      { role: 'user', content: 'I need advice on sensitive legal matter' }
    ],
    encryption: true,
    no_logs: true
  })
});
```

#### **MaaS** - Model Hosting
```javascript
// Deploy Model
const deployResponse = await fetch('https://maas.onasis.io/api/deploy', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${access_token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model_name: 'my-custom-model',
    model_file: 'model.pkl',
    runtime: 'python3.9',
    memory: '2GB',
    auto_scale: true
  })
});

// Model Inference
const inferenceResponse = await fetch('https://maas.onasis.io/api/inference', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${access_token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model_id: 'deployed_model_123',
    input_data: {
      features: [1.2, 3.4, 5.6, 7.8]
    }
  })
});
```

---

## 💰 **Billing & Usage**

### **Billing Models by Platform**

| Platform | Billing Model | Example Pricing |
|----------|---------------|-----------------|
| Seftec SaaS | Subscription Tiers | $29/month (Starter), $99/month (Pro) |
| SeftecHub | Usage-Based | $0.001 per API call |
| VortexCore | Token Consumption | $0.015 per 1K tokens |
| LanOnasis | Freemium Premium | Free tier + $19/month premium |
| MaaS | Compute Hours | $2.50 per GPU hour |

### **Check Usage**
```javascript
const usageResponse = await fetch('https://api.vortexai.io/billing/usage', {
  headers: { 'Authorization': `Bearer ${access_token}` }
});

const usage = await usageResponse.json();
console.log(usage);
// {
//   "total_requests": 15420,
//   "total_cost": 45.67,
//   "currency": "USD",
//   "billing_period": "2024-07-01 to 2024-07-31"
// }
```

---

## 🔧 **SDKs & Integration**

### **JavaScript/Node.js SDK**
```bash
npm install @onasis/core-sdk
```

```javascript
import OnasisCore from '@onasis/core-sdk';

const client = new OnasisCore({
  apiKey: 'your_api_key',
  platform: 'saas.seftec.tech'
});

// AI Chat
const response = await client.chat.completions.create({
  messages: [{ role: 'user', content: 'Hello!' }],
  model: 'onasis-chat-advanced'
});

// Text-to-Speech
const audio = await client.audio.speech.create({
  text: 'Hello world',
  voice: 'aria'
});
```

### **Python SDK**
```bash
pip install onasis-core
```

```python
import onasis_core

client = onasis_core.Client(
    api_key="your_api_key",
    platform="vortexcore.app"
)

# Generate embeddings
response = client.embeddings.create(
    input="Text to embed",
    model="onasis-embedding-secure"
)

# Vector search
results = client.vector_search(
    query="machine learning",
    top_k=5
)
```

---

## 🛡️ **Privacy & Security**

### **Privacy Guarantees**
- ✅ **Zero-Knowledge Architecture** - We never see your actual data
- ✅ **End-to-End Encryption** - All data encrypted in transit and at rest
- ✅ **Anonymous Processing** - Requests processed without user identification
- ✅ **GDPR/CCPA Compliant** - Full privacy law compliance
- ✅ **No Data Retention** - Request/response data not stored

### **Security Features**
- ✅ **API Key Authentication** - Secure token-based access
- ✅ **Rate Limiting** - Prevent abuse and ensure fair usage
- ✅ **IP Whitelisting** - Restrict access to authorized IPs
- ✅ **Audit Logging** - Complete activity tracking for compliance
- ✅ **SOC 2 Ready** - Enterprise security controls

---

## 📊 **Monitoring & Analytics**

### **Real-time Metrics**
Access your usage analytics:
```javascript
// Get real-time metrics
const metricsResponse = await fetch('https://api.vortexai.io/analytics/metrics', {
  headers: { 'Authorization': `Bearer ${access_token}` }
});

const metrics = await metricsResponse.json();
// {
//   "requests_per_minute": 45,
//   "average_response_time": 234,
//   "error_rate": 0.1,
//   "top_services": ["ai-chat", "embeddings", "tts"]
// }
```

### **Custom Dashboards**
- Platform-specific analytics
- Cross-platform insights
- Revenue attribution
- Performance monitoring
- Error tracking

---

## 🚀 **Advanced Features**

### **Webhook Integration**
```javascript
// Set up webhooks for real-time notifications
const webhookResponse = await fetch('https://api.vortexai.io/webhooks', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${access_token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    url: 'https://your-app.com/webhook',
    events: ['request.completed', 'billing.updated', 'error.occurred']
  })
});
```

### **Batch Processing**
```javascript
// Process multiple requests in batch
const batchResponse = await fetch('https://vortexcore.app/api/batch', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${access_token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    requests: [
      { service: 'ai-chat', data: { messages: [...] } },
      { service: 'embeddings', data: { input: 'text1' } },
      { service: 'embeddings', data: { input: 'text2' } }
    ]
  })
});
```

---

## ❓ **Troubleshooting**

### **Common Issues**

#### **Authentication Errors**
```json
{
  "error": {
    "code": "AUTH_INVALID",
    "message": "Invalid authentication token"
  }
}
```
**Solution**: Check your API key format and expiration.

#### **Rate Limit Exceeded**
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED", 
    "message": "Rate limit exceeded for this service"
  }
}
```
**Solution**: Implement exponential backoff or upgrade your plan.

#### **Service Unavailable**
```json
{
  "error": {
    "code": "SERVICE_ERROR",
    "message": "Service temporarily unavailable"
  }
}
```
**Solution**: Check service status at `https://status.onasis.io`

### **Getting Help**
- 📧 **Support Email**: support@onasis.io
- 📚 **Documentation**: https://docs.onasis.io
- 💬 **Community**: https://community.onasis.io
- 🐛 **Bug Reports**: https://github.com/onasis-core/issues

---

## 🎯 **Next Steps**

1. **Choose your platform** based on your needs
2. **Sign up** and get your API keys
3. **Explore the SDKs** for your preferred language
4. **Start building** with our privacy-first AI services
5. **Monitor usage** through the dashboard
6. **Scale up** as your needs grow

**Welcome to the future of privacy-first platform management!** 🚀

---

*Last updated: July 2024 • Version 1.0.0*