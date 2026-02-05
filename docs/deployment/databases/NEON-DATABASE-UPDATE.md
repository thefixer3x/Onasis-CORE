# Neon Database Configuration Update

## Issue
The auth-gateway was using an **incorrect Neon database** that didn't belong to the Lanonasis organization.

## Wrong Database
- Endpoint: `ep-snowy-surf-adqqsawd.c-2.us-east-1.aws.neon.tech`
- Organization: Unknown/wrong
- Status: Not accessible via MCP

## Correct Database  
- **Project**: Auth Gateway Neon Project
- **Org ID**: br-orange-cloud-adtz6zem
- **Project ID**: ep-snowy-surf-adqqsawd
- **Endpoint**: `ep-snowy-surf-adqqsawd-pooler.c-2.us-east-1.aws.neon.tech`
- **Region**: us-east-1
- **Status**: ✅ Accessible and working

Note: This is separate from the vibe-mcp database (plain-voice-23407025 - maas-database)

## Connection String Updated
```bash
# Old (Wrong)
postgresql://<user>:<password>@<host>:<port>/<db>

# New (Correct - Auth Gateway Database)
postgresql://<user>:<password>@<host>:<port>/<db>
```

## Verification
✅ Database connection healthy
✅ Service running stable
✅ Now connected to correct Lanonasis organization database

## Files Updated
1. `/opt/lanonasis/services/auth-gateway/.env` - Updated DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
2. `/opt/lanonasis/onasis-core/services/auth-gateway/.env.example` - Updated example

---
**Date**: October 23, 2025  
**Status**: ✅ RESOLVED - Now using correct Lanonasis Neon database

