# Onasis-CORE & SD-Ghost Protocol Architecture Separation

## 🎯 **Clear Separation of Responsibilities**

### **SD-Ghost Protocol** - AI as a Service Platform
**Repository**: `/Users/seyederick/CascadeProjects/sd-ghost-protocol`
**Supabase Project**: `mxtsdgkwzjzlttpotole.supabase.co`
**Purpose**: AI-focused services and capabilities

#### **Core Responsibilities:**
- ✅ **AI Model Integration** (OpenAI, Anthropic, Perplexity, etc.)
- ✅ **Memory Management** (Enhanced memory server, vector search)
- ✅ **TTS/STT Services** (ElevenLabs, Whisper)
- ✅ **AI-Powered Tools** (Summarization, tagging, embeddings)
- ✅ **MCP Handler** (Tool orchestration, ClickUp, Telegram)
- ✅ **Enhanced Memory Server** (Vector search, semantic memory)

#### **Target Users:**
- End users seeking AI capabilities
- Developers building AI applications
- Businesses needing AI integration

---

### **Onasis-CORE** - Partnership & Vendor Management Platform
**Repository**: `/Users/seyederick/DevOps/_project_folders/Onasis-CORE`
**Purpose**: Business partnerships, vendor management, and multi-platform orchestration

#### **Core Responsibilities:**
- ✅ **Vendor Management** (Unique identifiers, API keys, billing)
- ✅ **Partnership Orchestration** (Multi-platform coordination)
- ✅ **Business Logic** (Billing, usage tracking, compliance)
- ✅ **Privacy Gateway** (Vendor/client anonymization)
- ✅ **Control Room** (Single source of truth monitoring)
- ✅ **Multi-Platform Router** (Unified API access)

#### **Target Users:**
- Business partners and vendors
- Platform administrators
- Enterprise clients
- Resellers and integrators

---

## 🔄 **Integration Architecture**

```
┌─────────────────────────────────────────────────────────────┐
│                     ONASIS-CORE                            │
│                (Partnership Layer)                         │
├─────────────────────────────────────────────────────────────┤
│  Vendor Management │ Multi-Platform │ Control Room        │
│  • API Keys        │ • 5 Platforms  │ • Monitoring        │
│  • Billing         │ • Unified Auth │ • Analytics         │
│  • Privacy         │ • Routing      │ • Management        │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼ (Routes AI requests to)
┌─────────────────────────────────────────────────────────────┐
│                  SD-GHOST PROTOCOL                         │
│                 (AI Service Layer)                         │
├─────────────────────────────────────────────────────────────┤
│  AI Models         │ Memory System  │ Tool Integration    │
│  • OpenAI          │ • Vector DB    │ • MCP Handler       │
│  • Anthropic       │ • Semantic     │ • ClickUp           │
│  • Perplexity      │ • Enhanced     │ • Telegram          │
│  • Custom Models   │ • Search       │ • Workflows         │
└─────────────────────────────────────────────────────────────┘
```

## 🌐 **Platform Distribution**

### **Onasis-CORE Platforms** (Partnership Layer):
- `saas.seftec.tech` - Enterprise SaaS Platform
- `seftechub.com` - Developer Hub & Marketplace  
- `vortexcore.app` - AI/ML Infrastructure Platform
- `lanonasis.com` - Privacy-First Communication
- `maas.lanonasis.com` - Models as a Service

### **SD-Ghost Protocol** (AI Service Layer):
- Enhanced Memory Server (VPS: 168.231.74.29:3000)
- Supabase Edge Functions (AI processing)
- Vector Database (Semantic search)
- Tool Integration Hub (MCP)

## 🔑 **API Key Strategy**

### **Vendor API Keys** (Onasis-CORE):
```bash
# Business partners get Onasis keys
pk_live_SFTC_ABC123.sk_live_vendor_secret_key
```

### **Internal Service Keys** (SD-Ghost Protocol):
```bash
# Internal AI service authentication
MEMORY_API_KEY=sk_test_ghost_memory_2024_secure_api_key_v1
```

## 🔄 **Request Flow Example**

1. **Vendor makes request** → `https://saas.seftec.tech/api/ai-chat`
2. **Onasis-CORE** validates vendor API key, checks permissions, applies billing
3. **Onasis routes** → SD-Ghost Protocol Supabase function
4. **SD-Ghost Protocol** processes AI request using internal keys
5. **Response flows back** → Onasis applies branding, logs usage, returns to vendor

## 💰 **Business Model Separation**

### **Onasis-CORE Revenue Streams:**
- Vendor partnership fees
- Platform usage markups
- Enterprise licensing
- Multi-platform subscriptions

### **SD-Ghost Protocol Revenue Streams:**
- Direct AI service usage
- Memory storage fees
- Tool integration costs
- Enhanced feature access

## 🛡️ **Security Boundaries**

### **Onasis-CORE Security:**
- Vendor authentication & authorization
- Business data protection
- Partnership agreements
- Compliance management

### **SD-Ghost Protocol Security:**
- AI model access control
- Memory data encryption
- User privacy protection
- Service-level security

## 📊 **Data Separation**

### **Onasis-CORE Database Tables:**
- `vendor_organizations`
- `vendor_api_keys` 
- `vendor_usage_logs`
- `vendor_billing_records`
- `platform_sessions`

### **SD-Ghost Protocol Database Tables:**
- `memories`
- `chat_sessions`
- `profiles`
- `api_usage` (internal)
- `tool_integrations`

## 🎛️ **Control Room Oversight**

The Onasis-CORE Control Room monitors:
- **Partnership Health** (Vendor activity, billing status)
- **Platform Performance** (All 5 platforms)
- **AI Service Status** (SD-Ghost Protocol health)
- **Revenue Analytics** (Cross-platform billing)
- **Vendor Management** (API usage, permissions)

This creates a **perfect ecosystem** where:
- **SD-Ghost Protocol** focuses purely on AI excellence
- **Onasis-CORE** handles all business partnerships
- **Both systems** work together seamlessly
- **Clear separation** enables independent scaling

Your architecture is now **enterprise-grade** with perfect separation of concerns! 🚀