# 🚀 Onboarding Guides

**Purpose:** Drop-in documentation for integrating with The Fixer Initiative's database infrastructure  
**Database:** Neon PostgreSQL 17.5 (super-night-54410645)  
**Last Updated:** November 1, 2025

---

## 📋 Quick Reference

| Guide | Use When | Schemas | Complexity |
|-------|----------|---------|------------|
| [**Authentication**](./authentication-onboarding.md) | Setting up OAuth/SAML/SSO | `auth`, `auth_gateway` | ⭐⭐⭐ |
| [**App Onboarding**](./app-onboarding.md) | Creating new app schema | `control_room`, `app_*` | ⭐⭐ |
| [**AI Services**](./ai-services-onboarding.md) | Integrating AI/ML features | `agent_banks`, `app_sd_ghost` | ⭐⭐⭐ |
| [**Vendor Services**](./vendor-services-onboarding.md) | Third-party API integration | `vendors` | ⭐⭐ |
| [**Client Services**](./client-services-onboarding.md) | Multi-tenant setup | `client_services` | ⭐⭐ |
| [**Project Mapping**](./project-mapping-guide.md) | Schema architecture | All schemas | ⭐ |

---

## 🎯 How to Use These Guides

### 1. **Copy to Your Repository**
\`\`\`bash
# Clone this directory to your project
cp -r /path/to/db-recovery-tfi-v0/onboarding ./docs/database-onboarding

# Or download specific guides
curl -O https://raw.githubusercontent.com/thefixer3x/db-recovery-tfi-v0/main/onboarding/authentication-onboarding.md
\`\`\`

### 2. **Customize for Your App**
- Replace `app_your_service` with your actual app ID
- Update environment variables
- Adjust SQL queries for your use case
- Add app-specific tables

### 3. **Integrate with CICD**
- Add database migration scripts
- Set up environment variables in CI/CD
- Run connectivity tests
- Deploy with confidence

---

## 📚 Guide Descriptions

### 🔐 Authentication Onboarding
**File:** [`authentication-onboarding.md`](./authentication-onboarding.md)

Complete guide for integrating with the centralized authentication system.

**Covers:**
- OAuth 2.0 client registration & flow
- SAML 2.0 enterprise SSO setup
- SSO domain mapping
- JWT token verification
- Security best practices
- CICD integration
- Common troubleshooting

**Use For:**
- Web applications requiring user login
- Mobile apps with authentication
- API services needing token validation
- Enterprise SSO integration

**Schemas Used:**
- `auth` (18 tables) - Core authentication
- `auth_gateway` (8 tables) - API clients & admin access

**Estimated Setup Time:** 2-4 hours

---

### 📱 App Onboarding
**File:** [`app-onboarding.md`](./app-onboarding.md)

Step-by-step provisioning of new application schemas.

**Covers:**
- Control Room app registration
- Schema creation with standard tables
- Row-Level Security (RLS) policies
- Helper functions
- User access management
- Testing & verification
- CICD deployment

**Use For:**
- New microservices
- SaaS applications
- Multi-tenant apps
- Internal tools

**Standard Tables Created:**
- `users` - App-specific user records
- `profiles` - Extended user information
- `settings` - Key-value user preferences

**Estimated Setup Time:** 1-2 hours

---

### 🤖 AI Services Onboarding
**File:** [`ai-services-onboarding.md`](./ai-services-onboarding.md)

Integration with AI infrastructure (Agent Banks & SD-Ghost Protocol).

**Covers:**
- Agent Banks memory storage
- Vector embeddings with pgvector
- SD-Ghost Memory-as-a-Service
- AI response caching
- Usage tracking & analytics
- OpenAI/Anthropic integration
- LangChain examples

**Use For:**
- AI-powered chatbots
- RAG (Retrieval-Augmented Generation)
- Semantic search
- AI assistants
- Knowledge management

**Schemas Used:**
- `agent_banks` (6 tables) - AI memory & sessions
- `app_sd_ghost` (9 tables) - Memory-as-a-Service

**Estimated Setup Time:** 3-6 hours

---

### 🔌 Vendor Services Onboarding
**File:** [`vendor-services-onboarding.md`](./vendor-services-onboarding.md)

Secure management of third-party API credentials.

**Covers:**
- Vendor account registration
- Encrypted credential storage (AES-256-GCM)
- API key retrieval
- Common integrations (Stripe, SendGrid, Twilio)
- Security best practices
- Access monitoring

**Use For:**
- Payment processing (Stripe)
- Email services (SendGrid)
- SMS/calling (Twilio)
- Any third-party API

**Schema Used:**
- `vendors` (3 tables) - Encrypted credential storage

**Estimated Setup Time:** 1 hour

---

### 👥 Client Services Onboarding
**File:** [`client-services-onboarding.md`](./client-services-onboarding.md)

Multi-tenant organization and account management.

**Covers:**
- Organization setup
- Account provisioning
- Billing records
- Usage tracking
- Transaction logging
- Multi-tenant data isolation

**Use For:**
- B2B SaaS platforms
- Enterprise applications
- Agency/client portals
- Reseller platforms

**Schema Used:**
- `client_services` (5 tables) - Organizations, accounts, billing

**Estimated Setup Time:** 2-3 hours

---

### 🗺️ Project Mapping Guide
**File:** [`project-mapping-guide.md`](./project-mapping-guide.md)

Comprehensive architecture overview and schema allocation.

**Covers:**
- Complete schema map (40 schemas)
- Table distribution breakdown
- Data flow diagrams
- Schema relationships
- Naming conventions
- Best practices

**Use For:**
- Understanding the database architecture
- Planning new features
- Documentation
- Onboarding new developers

**Estimated Reading Time:** 30 minutes

---

## 🏗️ Database Architecture

### Current State
- **Total Tables:** 144
- **Total Schemas:** 40
- **PostgreSQL:** 17.5 (Neon serverless)
- **Extensions:** pgvector, pgcrypto, pg_trgm, uuid-ossp

### Schema Organization

\`\`\`
Central Hub (34 tables)
├── control_room: 8 tables - App registry & orchestration
├── auth: 18 tables - OAuth, SAML, SSO, identities
└── auth_gateway: 8 tables - API clients & admin access

Infrastructure (15 tables)
├── agent_banks: 6 tables - AI memory & sessions
└── app_sd_ghost: 9 tables - Memory-as-a-Service

Applications (54 tables)
└── 18 app schemas × 3 tables each
    (users, profiles, settings per app)

Shared Services (23 tables)
├── analytics: 3 tables - Usage tracking
├── billing: 3 tables - Payment processing
├── vendors: 3 tables - API credentials
├── shared_services: 3 tables - Utilities
├── client_services: 5 tables - Organizations
└── credit: 3 tables - Marketplace

Legacy (19 tables)
├── public: 18 tables - Historical data
└── neon_auth: 1 table - Auth sync
\`\`\`

---

## ⚙️ Prerequisites

### Database Access
\`\`\`bash
# Add to .env.local (DO NOT COMMIT)
postgresql://<user>:<password>@<host>:<port>/<db>
NEON_PROJECT_ID=your-neon-project-id
NEON_DATABASE_NAME=neondb
\`\`\`

### Required Tools
- PostgreSQL client (v17.6 recommended)
- Node.js 20+ (for test scripts)
- Neon CLI (optional, for branch management)

### Test Connectivity
\`\`\`bash
# Test basic connection
node test-db-connection.js

# Test comprehensive schemas
node scripts/test-connectivity.cjs
\`\`\`

---

## 🚀 CICD Integration Examples

### GitHub Actions
\`\`\`yaml
# .github/workflows/db-setup.yml
name: Database Setup

on:
  push:
    branches: [main]

jobs:
  setup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install PostgreSQL
        run: sudo apt-get install -y postgresql-client
      
      - name: Test Connection
        env:
postgresql://<user>:<password>@<host>:<port>/<db>
        run: node test-db-connection.js
      
      - name: Run Migrations
        env:
postgresql://<user>:<password>@<host>:<port>/<db>
        run: psql $DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
      
      - name: Verify Setup
        run: npm run test:db
\`\`\`

### GitLab CI
\`\`\`yaml
# .gitlab-ci.yml
db-setup:
  stage: setup
  image: postgres:17
  script:
    - psql $DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
    - psql $DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
  only:
    - main
\`\`\`

---

## 📊 Monitoring & Health Checks

### Database Health Script
\`\`\`bash
#!/bin/bash
# scripts/check-db-health.sh

echo "Checking database connectivity..."
node test-db-connection.js || exit 1

echo "Verifying app registration..."
psql $DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>

echo "Testing authentication endpoint..."
curl -f $AUTH_GATEWAY_URL/health || exit 1

echo "✅ All health checks passed!"
\`\`\`

### Monitor Schema Growth
\`\`\`sql
-- Track table sizes
SELECT 
    schemaname,
    COUNT(*) as table_count,
    pg_size_pretty(SUM(pg_total_relation_size(schemaname||'.'||tablename))) as total_size
FROM pg_tables
WHERE schemaname IN ('control_room', 'auth', 'agent_banks', 'app_sd_ghost', 'vendors')
GROUP BY schemaname
ORDER BY SUM(pg_total_relation_size(schemaname||'.'||tablename)) DESC;
\`\`\`

---

## 🔒 Security Checklist

Before deploying to production:

- [ ] All credentials stored in `.env.local` (not committed)
- [ ] GitGuardian or similar secret scanning enabled
- [ ] Row-Level Security (RLS) policies configured
- [ ] API keys encrypted with pgcrypto
- [ ] HTTPS enforced on all endpoints
- [ ] Token expiration configured
- [ ] Audit logging enabled
- [ ] Database backups scheduled
- [ ] Monitoring alerts set up
- [ ] Access permissions reviewed

---

## 📖 Additional Resources

### In This Repository
- [`/README.md`](../README.md) - Project overview
- [`/db-setup-kit/README.md`](../db-setup-kit/README.md) - Migration guides
- [`/MERGE_COMPLETE_REPORT.md`](../MERGE_COMPLETE_REPORT.md) - Recent changes
- [`/scripts/`](../scripts/) - SQL migration scripts
- [`test-db-connection.js`](../test-db-connection.js) - Quick connectivity test

### External Links
- [Neon Documentation](https://neon.tech/docs)
- [PostgreSQL 17 Docs](https://www.postgresql.org/docs/17/)
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [pgvector Guide](https://github.com/pgvector/pgvector)

---

## 🆘 Support

### Common Issues
1. **Connection failed** → Check DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
2. **Schema not found** → Run app provisioning script first
3. **Permission denied** → Verify RLS policies and roles
4. **Token invalid** → Check expiration and refresh token

### Getting Help
- **Issues:** https://github.com/thefixer3x/db-recovery-tfi-v0/issues
- **Discussions:** https://github.com/thefixer3x/db-recovery-tfi-v0/discussions
- **Email:** Check repository contacts

---

## 🎓 Learning Path

### Beginner → Advanced

1. **Start Here**
   - Read [Project Mapping Guide](./project-mapping-guide.md)
   - Test database connection
   - Review schema organization

2. **Basic Integration**
   - Follow [App Onboarding](./app-onboarding.md)
   - Create test schema
   - Deploy to staging

3. **Add Authentication**
   - Complete [Authentication Onboarding](./authentication-onboarding.md)
   - Register OAuth client
   - Test token flow

4. **Advanced Features**
   - Integrate [AI Services](./ai-services-onboarding.md)
   - Set up [Vendor Services](./vendor-services-onboarding.md)
   - Configure [Client Services](./client-services-onboarding.md)

5. **Production Deployment**
   - Configure CICD pipeline
   - Set up monitoring
   - Enable security features
   - Launch! 🚀

---

## 📝 Contributing

Found an issue or want to improve a guide?

1. Fork the repository
2. Update the guide
3. Test your changes
4. Submit a pull request

All contributions welcome!

---

**Ready to integrate?** Pick a guide above and get started! 🎉

---

*Last Updated: November 1, 2025*  
*Database Version: PostgreSQL 17.5 (Neon)*  
*Total Tables: 144 across 40 schemas*
