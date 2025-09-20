# 🔑 Foreign API Key Manager

**Secure storage and management of vendor API keys for Onasis-CORE**

## Overview

The Foreign API Key Manager addresses the critical missing component in the Onasis-CORE architecture - secure, dynamic management of vendor API keys. Instead of hardcoding keys in environment variables, this system provides encrypted storage, rotation capabilities, and admin-controlled key management.

## 🎯 Problem Solved

**Before:** 
```javascript
// Hardcoded in environment variables
const VENDOR_CONFIGS = {
  openai: {
    apiKey: process.env.OPENAI_API_KEY,  // ❌ Static, hard to rotate
  }
};
```

**After:**
```javascript
// Dynamic key retrieval
const apiKey = await keyManager.getVendorKey('openai', 'primary');
```

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                Foreign API Key Manager                      │
├─────────────────────────────────────────────────────────────┤
│  Admin API        │  Encryption      │  Database Storage    │
│  - CRUD Operations│  - AES-256-GCM   │  - Supabase/Postgres │
│  - Key Rotation   │  - Secure Vault  │  - RLS Policies      │
│  - Audit Logging  │  - IV Generation │  - Audit Trail       │
└─────────────────────────────────────────────────────────────┘
```

## 🔒 Security Features

### **Encryption**
- **Algorithm**: AES-256-GCM with random IV
- **Key Storage**: Environment variable `KEY_ENCRYPTION_SECRET`
- **Data Format**: `{encrypted, iv, authTag}`

### **Access Control**
- **Admin Only**: Only users with `role: 'admin'` can manage keys
- **JWT Authentication**: Token-based access via Supabase Auth
- **RLS Policies**: Row-level security in database

### **Audit Trail**
- **Key Access Logging**: Track when keys are retrieved
- **Admin Actions**: Log create, update, delete, rotate operations
- **IP Tracking**: Record admin IP addresses for security

## 📡 API Endpoints

### **Base URL**: `https://api.lanonasis.com/v1/keys`

### **Authentication**
All endpoints require admin authentication:
```
Authorization: Bearer <admin-jwt-token>
```

### **Vendor Key Management**

#### **List All Vendor Keys**
```http
GET /v1/keys/vendors
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "vendor_name": "openai",
      "key_name": "primary",
      "description": "Primary OpenAI API key for chat completions",
      "created_at": "2024-08-14T05:00:00Z",
      "updated_at": "2024-08-14T05:00:00Z",
      "last_used_at": "2024-08-14T06:30:00Z",
      "is_active": true
    }
  ],
  "count": 1
}
```

#### **Get Specific Vendor Key (Decrypted)**
```http
GET /v1/keys/vendors/{id}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "vendor_name": "openai",
    "key_name": "primary",
    "decrypted_key": "sk-1234567890abcdef...",
    "description": "Primary OpenAI API key",
    "created_at": "2024-08-14T05:00:00Z",
    "last_used_at": "2024-08-14T06:35:00Z"
  }
}
```

#### **Create New Vendor Key**
```http
POST /v1/keys/vendors
```

**Request:**
```json
{
  "vendor_name": "anthropic",
  "key_name": "primary",
  "api_key": "sk-ant-api03-[REDACTED]...",
  "description": "Primary Anthropic API key for Claude"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "vendor_name": "anthropic",
    "key_name": "primary",
    "description": "Primary Anthropic API key for Claude",
    "created_at": "2024-08-14T06:40:00Z",
    "is_active": true
  }
}
```

#### **Update Vendor Key**
```http
PUT /v1/keys/vendors/{id}
```

**Request:**
```json
{
  "key_name": "primary-updated",
  "api_key": "sk-new-key-1234567890abcdef...",
  "description": "Updated primary key",
  "is_active": true
}
```

#### **Rotate Vendor Key**
```http
POST /v1/keys/vendors/{id}/rotate
```

**Request:**
```json
{
  "new_api_key": "sk-new-rotated-key-1234567890abcdef..."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Vendor key rotated successfully",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "updated_at": "2024-08-14T06:45:00Z"
  }
}
```

#### **Deactivate Vendor Key**
```http
DELETE /v1/keys/vendors/{id}
```

**Response:**
```json
{
  "success": true,
  "message": "Vendor key deactivated successfully"
}
```

### **Health Check**
```http
GET /v1/keys/health
```

**Response:**
```json
{
  "status": "ok",
  "service": "Onasis-CORE Key Manager",
  "version": "1.0.0",
  "timestamp": "2024-08-14T06:50:00Z",
  "capabilities": [
    "vendor_key_storage",
    "key_encryption",
    "key_rotation",
    "admin_access_control"
  ]
}
```

## 💾 Database Schema

### **vendor_api_keys Table**
```sql
CREATE TABLE vendor_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_name VARCHAR(100) NOT NULL,
    key_name VARCHAR(200) NOT NULL,
    encrypted_key TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    
    UNIQUE(vendor_name, key_name)
);
```

### **vendor_key_audit_log Table**
```sql
CREATE TABLE vendor_key_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_id UUID REFERENCES vendor_api_keys(id),
    action VARCHAR(50) NOT NULL,
    user_id UUID,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## 🔧 Integration with API Gateway

### **Dynamic Key Retrieval**

Update the API Gateway to use the Key Manager:

```javascript
// Before (static)
const apiKey = process.env.OPENAI_API_KEY;

// After (dynamic)
const apiKey = await fetchVendorKey('openai', 'primary');

async function fetchVendorKey(vendor, keyName) {
  const response = await fetch('/v1/keys/vendors', {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  
  const keys = await response.json();
  const key = keys.data.find(k => 
    k.vendor_name === vendor && k.key_name === keyName
  );
  
  if (!key) throw new Error(`Key not found: ${vendor}/${keyName}`);
  
  // Fetch decrypted key
  const keyResponse = await fetch(`/v1/keys/vendors/${key.id}`);
  const keyData = await keyResponse.json();
  
  return keyData.data.decrypted_key;
}
```

## 🚀 Deployment

### **Environment Variables Required**
```bash
# Encryption key for vendor keys (32+ characters)
KEY_ENCRYPTION_SECRET=your-secure-encryption-key-32-chars-min

# Supabase credentials (already configured)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key
```

### **Database Migration**
```bash
# Apply the vendor keys migration
psql -f supabase/migrations/003_vendor_api_keys.sql
```

### **Service Startup**
```bash
# Local development
npm run key-manager

# Production (Netlify Functions)
# Auto-deployed via /v1/keys/* routes
```

## 🧪 Testing

### **Test Key Creation**
```bash
curl -X POST https://api.lanonasis.com/v1/keys/vendors \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "vendor_name": "test-vendor",
    "key_name": "test-key",
    "api_key": "test-key-value-123",
    "description": "Test key for development"
  }'
```

### **Test Key Retrieval**
```bash
curl https://api.lanonasis.com/v1/keys/vendors \
  -H "Authorization: Bearer <admin-token>"
```

## 🎯 Benefits

✅ **Dynamic Key Management** - No more hardcoded environment variables  
✅ **Secure Storage** - AES-256-GCM encryption at rest  
✅ **Key Rotation** - Easy rotation without service restart  
✅ **Audit Trail** - Complete logging of key access and changes  
✅ **Admin Control** - Role-based access to key management  
✅ **API Integration** - RESTful API for programmatic access  
✅ **Production Ready** - Deployed as Netlify functions  

## 🔄 Key Rotation Workflow

1. **Generate New Key** from vendor (OpenAI, Anthropic, etc.)
2. **Test New Key** in staging environment  
3. **Rotate via API**: `POST /v1/keys/vendors/{id}/rotate`
4. **Verify Rotation** in production
5. **Revoke Old Key** from vendor dashboard

This completes the missing Foreign API Key Manager component that was intended in the original Onasis-CORE architecture!