# API Key Management Service - Deployment Guide

## 🎯 Overview

This guide ensures the API key management tables (`api_key_projects` and `stored_api_keys`) are properly deployed to the Neon database before deploying the service.

## ✅ Pre-Deployment Checklist

### 1. Database Migration

**Run the migration script:**

```bash
cd /Users/seyederick/DevOps/_project_folders/lan-onasis-monorepo/apps/onasis-core/services/auth-gateway

# Ensure DATABASE_URL is set
echo $DATABASE_URL

# Run migration
node run-migration.mjs
```

**Expected Output:**
```
🚀 Starting database migrations...

📝 Running migration: 003_create_api_keys_table.sql
✅ Migration 003_create_api_keys_table.sql executed successfully

📝 Running migration: 006_api_key_management_service.sql
✅ Migration 006_api_key_management_service.sql executed successfully

🎉 All migrations completed successfully!
```

### 2. Verify Tables Exist

```sql
-- Run in Neon SQL editor
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('api_key_projects', 'stored_api_keys');
```

**Expected Result:**
```
table_name
------------------
api_key_projects
stored_api_keys
```

### 3. Verify Table Structures

```sql
-- Check api_key_projects
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'api_key_projects'
ORDER BY ordinal_position;

-- Check stored_api_keys
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'stored_api_keys'
ORDER BY ordinal_position;
```

**Expected Columns for `api_key_projects`:**
- id (uuid, NOT NULL)
- name (character varying, NOT NULL)
- description (text, NULL)
- organization_id (uuid, NOT NULL)
- owner_id (uuid, NOT NULL)
- team_members (ARRAY, NULL)
- settings (jsonb, NULL)
- created_at (timestamp with time zone, NOT NULL)
- updated_at (timestamp with time zone, NOT NULL)

**Expected Columns for `stored_api_keys`:**
- id (uuid, NOT NULL)
- name (character varying, NOT NULL)
- encrypted_value (text, NOT NULL)
- key_type (character varying, NOT NULL)
- environment (character varying, NOT NULL)
- project_id (uuid, NOT NULL)
- organization_id (uuid, NOT NULL)
- access_level (character varying, NOT NULL)
- status (character varying, NOT NULL)
- tags (ARRAY, NULL)
- usage_count (integer, NULL)
- last_rotated (timestamp with time zone, NULL)
- rotation_frequency (integer, NULL)
- expires_at (timestamp with time zone, NULL)
- metadata (jsonb, NULL)
- created_by (uuid, NOT NULL)
- created_at (timestamp with time zone, NOT NULL)
- updated_at (timestamp with time zone, NOT NULL)

### 4. Test Data Insertion

```sql
-- Test project creation
INSERT INTO api_key_projects (name, description, organization_id, owner_id)
VALUES (
  'Test Project',
  'Test deployment',
  '00000000-0000-0000-0000-000000000001'::uuid,
  '00000000-0000-0000-0000-000000000002'::uuid
)
RETURNING id, name, created_at;

-- Note the project_id from above, then test key creation
INSERT INTO stored_api_keys (
  name, encrypted_value, key_type, environment,
  project_id, organization_id, created_by
)
VALUES (
  'Test API Key',
  'encrypted_test_value_12345',
  'api_key',
  'development',
  '<project_id_from_above>'::uuid,
  '00000000-0000-0000-0000-000000000001'::uuid,
  '00000000-0000-0000-0000-000000000002'::uuid
)
RETURNING id, name, status, created_at;

-- Clean up test data
DELETE FROM api_key_projects WHERE name = 'Test Project';
```

## 📋 Service Deployment

### Files Added/Modified

#### ✅ New Files Created
1. **`src/services/stored-keys.service.ts`**
   - CRUD operations for `stored_api_keys` table
   - Ownership validation via `projects.service.ts`
   - Organization-level access control

2. **`src/controllers/stored-keys.controller.ts`**
   - HTTP handlers for stored keys endpoints
   - Authentication checks
   - Error handling

#### ✅ Modified Files
1. **`run-migration.mjs`**
   - Updated to run multiple migrations
   - Runs 003 and 006 migrations in sequence

2. **`src/routes/projects.routes.ts`**
   - Added nested `/api-keys` routes under projects
   - Replaces old `listProjectApiKeys` with new stored keys CRUD

## 🔌 API Endpoints Exposed

### Project Management (Existing)
- `GET /api/v1/projects` - List all projects for user
- `POST /api/v1/projects` - Create a new project
- `GET /api/v1/projects/:projectId` - Get project details
- `PUT /api/v1/projects/:projectId` - Update project
- `DELETE /api/v1/projects/:projectId` - Delete project

### Stored API Keys (New)
- `GET /api/v1/projects/:projectId/api-keys` - List all keys in project
- `POST /api/v1/projects/:projectId/api-keys` - Create a new stored key
- `GET /api/v1/projects/:projectId/api-keys/:keyId` - Get specific key
- `PATCH /api/v1/projects/:projectId/api-keys/:keyId` - Update key
- `DELETE /api/v1/projects/:projectId/api-keys/:keyId` - Delete key

## 🧪 Testing

### 1. Test Project Creation

```bash
curl -X POST https://auth-gateway.lanonasis.com/api/v1/projects \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Test Project",
    "description": "Testing API key management",
    "organizationId": "YOUR_ORG_ID"
  }'
```

### 2. Test Stored Key Creation

```bash
# Replace PROJECT_ID with the ID from above
curl -X POST https://auth-gateway.lanonasis.com/api/v1/projects/PROJECT_ID/api-keys \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "OpenAI API Key",
    "encryptedValue": "ENCRYPTED_VALUE_HERE",
    "keyType": "api_key",
    "environment": "production",
    "tags": ["openai", "llm"],
    "rotationFrequency": 90
  }'
```

### 3. Test Key Listing

```bash
curl https://auth-gateway.lanonasis.com/api/v1/projects/PROJECT_ID/api-keys \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 4. Test Key Retrieval

```bash
curl https://auth-gateway.lanonasis.com/api/v1/projects/PROJECT_ID/api-keys/KEY_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 5. Test Key Update

```bash
curl -X PATCH https://auth-gateway.lanonasis.com/api/v1/projects/PROJECT_ID/api-keys/KEY_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "rotating",
    "encryptedValue": "NEW_ENCRYPTED_VALUE"
  }'
```

### 6. Test Key Deletion

```bash
curl -X DELETE https://auth-gateway.lanonasis.com/api/v1/projects/PROJECT_ID/api-keys/KEY_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 🔒 Security Validations

The service implements these security checks:

1. **Authentication Required** - All endpoints require valid JWT token
2. **Project Ownership** - User must own or be team member of project
3. **Organization Isolation** - Keys only accessible within same organization
4. **Cascading Deletes** - Deleting project removes all associated keys
5. **Encrypted Storage** - API keys stored encrypted in `encrypted_value` field

## 🔍 Validation Helpers Centralized

From `projects.service.ts` (reused in `stored-keys.service.ts`):

- **`getProjectById()`** - Validates user access to project
- **`isUuid()`** - UUID format validation
- **`isPrivilegedRole()`** - Admin/platform admin checks
- **`normalizeTeamMembers()`** - Team member list sanitization

## 📊 Database Schema

### Key Relationships
```
organizations (external)
    ↓
api_key_projects
    ↓
stored_api_keys
```

### Foreign Keys
- `stored_api_keys.project_id` → `api_key_projects.id` (CASCADE DELETE)
- `stored_api_keys.organization_id` → `organizations.id` (REFERENCES)
- `stored_api_keys.created_by` → `users.id` (REFERENCES)

### Indexes
- `idx_stored_api_keys_project` on `project_id`
- `idx_stored_api_keys_org` on `organization_id`
- `idx_stored_api_keys_status` on `status`
- `idx_stored_api_keys_expires` on `expires_at`

### Unique Constraints
- `(project_id, name)` - Key names must be unique within a project

## 🚀 Post-Deployment Verification

### 1. Check Service Health
```bash
curl https://auth-gateway.lanonasis.com/health
```

### 2. Verify Tables in Production
```bash
# Connect to Neon database
psql $DATABASE_URL

# Check tables exist
\dt api_key_projects
\dt stored_api_keys

# Check row counts
SELECT COUNT(*) FROM api_key_projects;
SELECT COUNT(*) FROM stored_api_keys;
```

### 3. Monitor Logs
```bash
# Check for any errors during startup
pm2 logs auth-gateway --lines 50
```

### 4. Test with VS Code Extension

The VS Code extension expects these endpoints to:
1. List projects for authenticated user
2. List stored keys in each project
3. Create/update/delete keys via UI

## ⚠️ Rollback Plan

If deployment fails:

```sql
-- Rollback migrations (if needed)
DROP TABLE IF EXISTS mcp_key_audit_log CASCADE;
DROP TABLE IF EXISTS mcp_proxy_tokens CASCADE;
DROP TABLE IF EXISTS mcp_key_sessions CASCADE;
DROP TABLE IF EXISTS mcp_key_access_requests CASCADE;
DROP TABLE IF EXISTS mcp_key_tools CASCADE;
DROP TABLE IF EXISTS key_security_events CASCADE;
DROP TABLE IF EXISTS key_usage_analytics CASCADE;
DROP TABLE IF EXISTS key_rotation_policies CASCADE;
DROP TABLE IF EXISTS stored_api_keys CASCADE;
DROP TABLE IF EXISTS api_key_projects CASCADE;
```

Then restore previous service version.

## ✅ Success Criteria

- ✅ Migration runs without errors
- ✅ Tables `api_key_projects` and `stored_api_keys` exist
- ✅ All API endpoints return 401 for unauthenticated requests
- ✅ Authenticated users can create projects
- ✅ Users can CRUD stored keys in their projects
- ✅ Users cannot access keys from other organizations
- ✅ Cascade delete works (deleting project removes keys)
- ✅ VS Code extension can list and manage keys

## 📞 Support

If issues arise during deployment:
1. Check logs: `pm2 logs auth-gateway`
2. Verify database connection: `psql $DATABASE_URL`
3. Test migration manually: `node run-migration.mjs`
4. Review error codes in API responses

---

**Deployment Date**: _________________  
**Deployed By**: _________________  
**Database**: Neon PostgreSQL  
**Service**: Auth Gateway (auth-gateway.lanonasis.com)  
**Status**: ⬜ Not Started | ⬜ In Progress | ⬜ Complete | ⬜ Rolled Back
