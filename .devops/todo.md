# Onasis-CORE - Development TODO

> Last Updated: 2025-08-22 17:00:00 UTC
> Repository: Onasis-CORE (Main Repository)
> Status: Active Development

## 🎯 Current Sprint Status

### ✅ Completed Tasks
- [x] **MCP Server Migration** - Successfully extracted to standalone repository
- [x] **Repository Structure** - Organized project components and documentation
- [x] **Legacy Code Cleanup** - Removed outdated components and dependencies
- [x] **Documentation Updates** - Updated README and project structure docs

### 🔄 In Progress  
- [ ] **Core Service Integration** - Connecting remaining services to main architecture
- [ ] **API Gateway Optimization** - Performance improvements for request routing
- [ ] **Authentication Modernization** - Upgrade to latest OAuth/JWT standards

### 📋 Backlog (High Priority)
- [ ] **Microservices Migration** - Extract remaining services to dedicated repositories
- [ ] **Container Strategy** - Docker containerization for all services
- [ ] **Database Migration** - Centralize database schemas and migrations
- [ ] **Monitoring Integration** - Centralized logging and metrics collection
- [ ] **Security Audit** - Complete security review and hardening
- [ ] **Performance Testing** - Load testing and optimization
- [ ] **Backup Strategy** - Automated backup and disaster recovery
- [ ] **Documentation Portal** - Centralized documentation system

### 🔬 Technical Debt
- [ ] **Legacy Dependencies** - Update outdated packages and libraries
- [ ] **Code Standards** - Implement consistent coding standards across all services
- [ ] **Test Coverage** - Improve test coverage to 80%+ across all components
- [ ] **Configuration Management** - Centralize environment configuration
- [ ] **Error Handling** - Standardize error handling patterns
- [ ] **API Versioning** - Implement proper API versioning strategy

### 🚀 Future Enhancements
- [ ] **GraphQL Gateway** - Unified API layer with GraphQL
- [ ] **Event-Driven Architecture** - Message queue integration for async operations
- [ ] **Multi-Cloud Strategy** - Cloud-agnostic deployment options
- [ ] **AI/ML Pipeline** - Machine learning model deployment pipeline
- [ ] **Real-time Features** - WebSocket/SSE integration across services
- [ ] **Mobile SDK** - Native mobile application support
- [ ] **Plugin Ecosystem** - Third-party integration framework

### 📊 Sprint Metrics
- **Active Services**: 7 core services
- **Code Coverage**: 65% (target: 80%)
- **Security Score**: 82/100
- **Performance Score**: 88/100
- **Documentation Completeness**: 70%

---

## 🏗️ Architecture Components

### Active Services
1. **API Gateway** - Central request routing and authentication
2. **User Management** - Authentication and authorization service  
3. **Payment Processing** - Financial transaction handling
4. **Notification Service** - Multi-channel notification delivery
5. **Analytics Engine** - Data processing and insights
6. **File Storage** - Document and media management
7. **Background Jobs** - Async task processing

### Extracted Services
- **MCP Server** → `lanonasis/onasis-mcp-server` (Standalone)

### Service Dependencies
```
API Gateway ──┬── User Management
              ├── Payment Processing  
              ├── Notification Service
              ├── Analytics Engine
              ├── File Storage
              └── Background Jobs
```

---

*Updated by: Claude Code Assistant*
*Next Review: 2025-08-29*
## [2025-08-29] Security Hardening – Key Management & Auth
- [ ] Hotfix: stop returning `key_secret` in create/rotate API key tool responses
- [ ] Hotfix: store only hash (Argon2id/BCrypt) for internal API keys; generate non-recoverable secrets
- [ ] Fix vendor key encryption: switch to AES-256-GCM with createCipheriv, store iv+tag; migrate legacy rows
- [ ] Remove decrypted vendor key readback; reference-only responses (kid/version/vendor)
- [ ] Implement output redaction for secrets across WS/SSE logs
- [ ] Introduce approvals default (`exec.plan` → `exec.confirm`) for secret-using/write ops
- [ ] Add `@onasis/vault-broker` abstraction (GCP Secret Manager + KMS baseline)
- [ ] JIT injection: resolve secret references server-side and inject transiently at execution
- [ ] Add KEY_MANAGEMENT.md and SECURITY.md; align with Privacy/TOMs/DPA
- [ ] Map adapters to OAuth/device-code flows; avoid raw key storage where possible
