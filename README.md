# Onasis-CORE

**Privacy-First Infrastructure Services Platform**

Onasis-CORE is a comprehensive privacy-protecting infrastructure platform that provides secure, anonymous bridges between vendors and clients. Built for sub-selling services while maintaining complete privacy for all parties.

## 🏗️ **Architecture Overview**

```
Client → VortexAI Branding → Onasis-CORE → Vendor APIs → Response
   ↑                              ↓
Privacy Protection         Identity Masking
```

## 🔒 **Core Services**

### **API Gateway** (`/api-gateway`)
Privacy-protecting API proxy for sub-selling vendor services
- Vendor identity masking
- Client anonymization  
- Request/response sanitization
- Anonymous billing tracking

### **Data Masking** (`/data-masking`) 
Personal data anonymization and protection services
- PII detection and removal
- Data tokenization
- Secure data vaults

### **Email Proxy** (`/email-proxy`)
Anonymous email routing and filtering
- Email identity masking
- Spam/threat filtering
- Secure message delivery

### **Billing Service** (`/billing-service`)
Anonymous transaction processing and tracking
- Usage-based billing
- Anonymous payment processing
- Revenue sharing automation

### **Webhook Proxy** (`/webhook-proxy`)
Secure webhook routing with privacy protection
- Webhook anonymization
- Payload filtering
- Delivery verification

## 🌐 **Connection Points**

**Client-Facing Domains:**
- `api.vortexai.io` - Main branded API endpoint
- `secure.lanonasis.com` - Privacy-focused branding
- `gateway.apiendpoint.net` - Neutral connection point

**Internal/Vendor Routing:**
- `proxy.connectionpoint.io` - Vendor API masking
- `bridge.lanonasis.com` - Internal service communication
- `webhook.vortexai.io` - Callback routing

## 🚀 **Quick Start**

```bash
# Clone the repository
git clone https://github.com/yourusername/Onasis-CORE.git

# Deploy to VPS
./deployment/deploy-all.sh

# Or deploy specific service
./deployment/deploy-api-gateway.sh
./deployment/deploy-email-proxy.sh
```

## 📡 **Supabase Integration**

Connected to **The Fixer Initiative** Supabase project for:
- User authentication and management
- Usage analytics and billing data
- Service configuration and monitoring
- Audit logs and compliance tracking

## 🛡️ **Privacy Guarantees**

- ✅ **Zero-Knowledge Architecture** - We never see actual data
- ✅ **Identity Masking** - Vendors and clients remain anonymous
- ✅ **Request Sanitization** - All PII stripped automatically
- ✅ **Encrypted Transit** - End-to-end encryption for all data
- ✅ **Anonymous Billing** - Track usage without exposing identities
- ✅ **Compliance Ready** - GDPR, CCPA, HIPAA compatible

## 🏢 **Business Model**

**Sub-Selling as a Service:**
1. **API Gateway** - Charge markup on vendor API calls
2. **Data Protection** - Privacy compliance as a service
3. **White Label** - Branded privacy infrastructure for enterprises
4. **Consulting** - Privacy architecture consulting services

## 📊 **Service Status**

| Service | Status | Endpoint | Privacy Level |
|---------|--------|----------|---------------|
| API Gateway | 🟢 Active | `api.vortexai.io` | High |
| Data Masking | 🟡 Development | `data.lanonasis.com` | Maximum |
| Email Proxy | 🔴 Planned | `mail.lanonasis.com` | High |
| Billing Service | 🟡 Development | `bill.lanonasis.com` | Medium |
| Webhook Proxy | 🔴 Planned | `hook.lanonasis.com` | High |

## 🔧 **Infrastructure**

**VPS Configuration:**
- **Primary VPS:** Hostinger (168.231.74.29)
- **Load Balancer:** Nginx with privacy headers
- **SSL:** Let's Encrypt with automated renewal
- **Monitoring:** Custom privacy-aware logging

**Tech Stack:**
- **Backend:** Node.js with Express
- **Database:** Supabase (The Fixer Initiative)
- **Proxy:** Nginx with custom privacy modules
- **Deployment:** GitHub Actions + Docker
- **Monitoring:** Custom analytics with anonymization

## 📝 **Documentation**

- [API Gateway Documentation](./docs/api-gateway.md)
- [Privacy Policy](./docs/privacy-policy.md)
- [Developer Guide](./docs/developer-guide.md)
- [Deployment Guide](./docs/deployment.md)
- [Business Operations](./docs/business-ops.md)

## 🤝 **Contributing**

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-privacy`)
3. Commit changes (`git commit -m 'Add amazing privacy feature'`)
4. Push to branch (`git push origin feature/amazing-privacy`)
5. Create Pull Request

## 📄 **License**

Proprietary - All rights reserved. Contact for licensing opportunities.

## 📞 **Contact**

- **Business Inquiries:** business@lanonasis.com
- **Technical Support:** support@lanonasis.com
- **Privacy Officer:** privacy@lanonasis.com

---

**Onasis-CORE** - *Privacy by Design, Profit by Service*