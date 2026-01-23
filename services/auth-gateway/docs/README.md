# Auth Gateway Documentation

This directory contains organized documentation for the Auth Gateway service.

## Directory Structure

```
docs/
├── architecture/     # System design, API structure, CQRS patterns
├── deployment/       # Deployment guides for VPS, PM2, Neon
├── oauth/           # OAuth2/PKCE implementation and troubleshooting
├── implementation/  # Code implementation details and patches
└── archive/
    ├── fixes/       # Historical fix documentation (for reference)
    └── status/      # Historical status reports and planning docs
```

## Quick Links

### Getting Started
- [README](../README.md) - Main auth-gateway overview
- [Quick Start](../QUICK-START.md) - Getting up and running
- [Quick Reference](../QUICK-REFERENCE.md) - Common commands and endpoints

### Architecture
- [System Architecture](architecture/AUTH_SYSTEM_ARCHITECTURE.md) - Full system design
- [Authentication Methods](architecture/AUTHENTICATION-METHODS.md) - All 10 auth methods
- [CQRS Implementation](architecture/AUTH_GATEWAY_CQRS_IMPLEMENTATION.md) - Event sourcing patterns

### Deployment
- [Deployment Guide](deployment/DEPLOYMENT.md) - Main deployment instructions
- [VPS Deployment](deployment/deploy-to-vps.sh) - VPS deployment script
- [PM2 Setup](deployment/LOCAL-PM2-SETUP-COMPLETE.md) - Local PM2 configuration

### OAuth
- [OAuth Dual Path Guide](oauth/OAUTH-DUAL-PATH-GUIDE.md) - Supabase + direct OAuth
- [PKCE Implementation](oauth/OAUTH2_PKCE_IMPLEMENTATION_PLAN.md) - Device code flow

## Scripts

Deploy, test, and utility scripts are organized in `../scripts/`:
- `scripts/deploy/` - Deployment automation
- `scripts/test/` - Testing and validation
- `scripts/utils/` - Utility and fix scripts
