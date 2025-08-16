# Onasis-CORE API Gateway Documentation

## Overview

The Onasis-CORE API Gateway is a privacy-protecting proxy service that enables secure sub-selling of vendor APIs while maintaining complete anonymity for both vendors and clients.

## Architecture

```
Client Application → Onasis Gateway → Vendor API → Response
                       ↓
                Privacy Protection
                   ↓        ↓
            Vendor Masking  Client Anonymization
```

## Privacy Protection Features

### Vendor Protection
- **Identity Masking**: All vendor-specific branding replaced with Onasis branding
- **Model Name Anonymization**: `gpt-4` becomes `onasis-chat-advanced`
- **Metadata Stripping**: Removes vendor-specific response metadata
- **Header Sanitization**: Strips vendor identification headers

### Client Protection
- **IP Anonymization**: Client IP addresses are never forwarded to vendors
- **Session Tracking**: Anonymous session IDs instead of user identification
- **PII Removal**: Automatic detection and removal of personally identifiable information
- **Request Sanitization**: Sanitizes all request data before forwarding

## API Endpoints

### Base URLs
- **Production**: `https://api.vortexai.io`
- **Neutral Gateway**: `https://gateway.apiendpoint.net`
- **Development**: `http://localhost:3001`

### Authentication
Include your API key in the `Authorization` header:
```
Authorization: Bearer your_api_key_here
```

### Supported Vendors
Specify vendor using the `X-Vendor` header:
- `openai` - OpenAI GPT models
- `anthropic` - Anthropic Claude models  
- `perplexity` - Perplexity AI models
- `custom` - Custom vendor APIs

## Endpoints

### Chat Completions
**POST** `/api/v1/chat/completions`

Create a chat completion with privacy protection.

**Headers:**
```
Content-Type: application/json
Authorization: Bearer your_api_key
X-Vendor: openai
```

**Request Body:**
```json
{
  "messages": [
    {
      "role": "user",
      "content": "Hello, how are you?"
    }
  ],
  "model": "onasis-chat-advanced",
  "max_tokens": 150,
  "temperature": 0.7
}
```

**Response:**
```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1677652288,
  "model": "onasis-chat-advanced",
  "provider": "onasis-core",
  "privacy_level": "high",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! I'm doing well, thank you for asking."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 9,
    "completion_tokens": 12,
    "total_tokens": 21
  },
  "onasis_metadata": {
    "vendor": "onasis-core",
    "response_time": 1234,
    "anonymous_id": "req_abc123",
    "billing": {
      "cost": 0.00042,
      "currency": "USD"
    }
  }
}
```

### Text Completions
**POST** `/api/v1/completions`

Create a text completion with privacy protection.

**Request Body:**
```json
{
  "prompt": "The future of AI is",
  "model": "onasis-completion-fast",
  "max_tokens": 100,
  "temperature": 0.8
}
```

### Embeddings
**POST** `/api/v1/embeddings`

Create embeddings with privacy protection.

**Request Body:**
```json
{
  "input": "Your text here",
  "model": "onasis-embedding-secure"
}
```

### List Models
**GET** `/api/v1/models`

Get available Onasis-branded models.

**Response:**
```json
{
  "object": "list",
  "data": [
    {
      "id": "onasis-chat-advanced",
      "object": "model",
      "owned_by": "onasis-core",
      "description": "Advanced chat model with privacy protection"
    }
  ]
}
```

### Health Check
**GET** `/health`

Check service health and status.

**Response:**
```json
{
  "status": "ok",
  "service": "Onasis-CORE API Gateway",
  "version": "1.0.0",
  "privacy_level": "high",
  "features": [
    "vendor_masking",
    "client_anonymization",
    "request_sanitization",
    "billing_integration"
  ]
}
```

### Service Info
**GET** `/info`

Get service information and capabilities.

## Rate Limiting

Rate limits are applied per anonymous session:

| Endpoint | Rate Limit |
|----------|------------|
| Chat Completions | 100 requests/minute |
| General API | 200 requests/minute |
| Health Check | 1000 requests/minute |

Rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 99
X-RateLimit-Reset: 1677652348
```

## Privacy Headers

All responses include privacy protection headers:

```
X-Powered-By: Onasis-CORE
X-Privacy-Level: High
X-Request-ID: req_abc123def456
```

## Error Handling

### Error Response Format
```json
{
  "error": {
    "message": "Service temporarily unavailable",
    "type": "gateway_error",
    "code": "PROXY_FAILURE"
  },
  "request_id": "req_abc123def456"
}
```

### Common Error Codes

| Code | Description |
|------|-------------|
| `INVALID_VENDOR` | Unsupported vendor specified |
| `RATE_LIMIT_EXCEEDED` | Rate limit exceeded |
| `PROXY_FAILURE` | Failed to proxy to vendor |
| `ENDPOINT_NOT_FOUND` | Invalid endpoint |
| `INTERNAL_ERROR` | Gateway internal error |

## Billing and Usage

### Cost Structure
- **Base vendor cost** + **Onasis markup (25%)**
- Billing calculated per token usage
- Anonymous usage tracking
- Real-time cost calculation

### Usage Metadata
Each response includes billing information:
```json
{
  "onasis_metadata": {
    "usage": {
      "input_tokens": 10,
      "output_tokens": 15,
      "total_tokens": 25
    },
    "billing": {
      "cost": 0.00375,
      "currency": "USD"
    }
  }
}
```

## Privacy Guarantees

### Data Handling
1. **Zero Knowledge**: Onasis never stores request/response content
2. **Anonymous Logging**: Only non-identifying metadata is logged
3. **Automatic PII Detection**: Personal information automatically stripped
4. **Secure Transit**: All data encrypted in transit
5. **No Vendor Tracking**: Vendors cannot identify individual clients

### Compliance
- **GDPR Compliant**: No personal data processing
- **CCPA Compliant**: Anonymous data handling
- **HIPAA Ready**: Healthcare data protection
- **SOC 2 Ready**: Security controls implementation

## Integration Examples

### JavaScript/Node.js
```javascript
const response = await fetch('https://api.vortexai.io/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your_api_key',
    'X-Vendor': 'openai'
  },
  body: JSON.stringify({
    messages: [{ role: 'user', content: 'Hello!' }],
    model: 'onasis-chat-advanced'
  })
});

const data = await response.json();
console.log(data.choices[0].message.content);
```

### Python
```python
import requests

response = requests.post(
    'https://api.vortexai.io/api/v1/chat/completions',
    headers={
        'Content-Type': 'application/json',
        'Authorization': 'Bearer your_api_key',
        'X-Vendor': 'openai'
    },
    json={
        'messages': [{'role': 'user', 'content': 'Hello!'}],
        'model': 'onasis-chat-advanced'
    }
)

data = response.json()
print(data['choices'][0]['message']['content'])
```

### cURL
```bash
curl -X POST https://api.vortexai.io/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_api_key" \
  -H "X-Vendor: openai" \
  -d '{
    "messages": [{"role": "user", "content": "Hello!"}],
    "model": "onasis-chat-advanced"
  }'
```

## Support

- **Documentation**: https://docs.lanonasis.com
- **Technical Support**: support@lanonasis.com
- **Business Inquiries**: business@lanonasis.com
- **Privacy Officer**: privacy@lanonasis.com

## Changelog

### v1.0.0 (2024-07-06)
- Initial release
- API Gateway with privacy protection
- Multi-vendor support
- Anonymous billing system
- Rate limiting and security features