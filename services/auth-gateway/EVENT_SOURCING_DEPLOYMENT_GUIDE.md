# Event-Sourcing Deployment Guide
**Auth Gateway CQRS/Event-Sourcing Implementation**

This guide covers the complete deployment process for the auth-gateway's event-sourcing infrastructure, enabling seamless event propagation from Neon (command side) to Supabase (read side).

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Deployment Steps](#deployment-steps)
4. [Verification & Testing](#verification--testing)
5. [Monitoring](#monitoring)
6. [Troubleshooting](#troubleshooting)

---

## Overview

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     COMMAND SIDE (Neon)                         │
│                                                                  │
│  ┌──────────┐   ┌────────────┐   ┌──────────┐   ┌──────────┐  │
│  │  Client  │──▶│ Auth       │──▶│  Events  │──▶│  Outbox  │  │
│  │ Request  │   │ Controller │   │  Table   │   │  Table   │  │
│  └──────────┘   └────────────┘   └──────────┘   └──────────┘  │
│                                          │                       │
└──────────────────────────────────────────┼───────────────────────┘
                                           │
                                    ┌──────▼───────┐
                                    │   Outbox     │
                                    │  Forwarder   │
                                    │   (PM2)      │
                                    └──────┬───────┘
                                           │
┌──────────────────────────────────────────▼───────────────────────┐
│                     READ SIDE (Supabase)                         │
│                                                                  │
│  ┌───────────┐   ┌─────────────┐   ┌───────────────────────┐  │
│  │ Auth      │──▶│ apply_auth  │──▶│   Projections         │  │
│  │ Events    │   │ _event RPC  │   │  - auth_users_view     │  │
│  │ Table     │   │             │   │  - auth_sessions_view  │  │
│  │           │   │             │   │  - auth_api_keys_view  │  │
│  └───────────┘   └─────────────┘   │  - auth_audit_view     │  │
│                                     └───────────────────────┘  │
│                                              │                  │
│                                     ┌────────▼────────┐        │
│                                     │  Consumers      │        │
│                                     │  - Netlify      │        │
│                                     │  - MCP          │        │
│                                     │  - Dashboard    │        │
│                                     └─────────────────┘        │
└────────────────────────────────────────────────────────────────┘
```

### Event Types

| Event Type | Aggregate | Triggered By | Payload |
|------------|-----------|--------------|---------|
| `UserUpserted` | user | User login/registration | email, role, provider, last_sign_in_at |
| `SessionCreated` | session | Session creation | user_id, platform, scope, expires_at |
| `SessionRevoked` | session | Logout/expiry | user_id, platform, scope, expires_at |
| `ApiKeyCreated` | api_key | API key generation | user_id, access_level, expires_at, name |
| `ApiKeyRotated` | api_key | API key rotation | user_id, access_level, expires_at |
| `ApiKeyRevoked` | api_key | API key revocation | user_id, is_active |
| `ApiKeyDeleted` | api_key | API key deletion | user_id |
| `AuthEventLogged` | user/client | Audit logging | event_type, success, platform, error_message |

---

## Prerequisites

### Environment Variables

Ensure the following environment variables are set in `.env`:

```bash
# Neon Database (Command Side)
DATABASE_URL="postgresql://neondb_owner:***@ep-***-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require"

# Supabase (Read Side)
SUPABASE_URL="https://lanonasis.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.***"
SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.***"

# Auth Gateway
PORT=4000
NODE_ENV="production"
```

### Database Access

- **Neon**: Admin access to run migrations
- **Supabase**: Service role access for event ingestion

---

## Deployment Steps

### Step 1: Apply Neon Migration (Command Side)

Apply the event store schema to Neon:

```bash
# Navigate to auth-gateway directory
cd apps/onasis-core/services/auth-gateway

# Apply the migration
psql "$DATABASE_URL" -f migrations/009_event_store.sql
```

**Expected Output:**
```
CREATE TABLE
CREATE INDEX
CREATE INDEX
CREATE TABLE
CREATE INDEX
CREATE INDEX
CREATE FUNCTION
CREATE TRIGGER
```

**Verify:**
```bash
psql "$DATABASE_URL" -c "\dt auth_gateway.*" | grep -E "(events|outbox)"
```

You should see:
```
auth_gateway | events | table | neondb_owner
auth_gateway | outbox | table | neondb_owner
```

### Step 2: Apply Supabase Migration (Read Side)

Apply the auth_events projection schema to Supabase:

```bash
# Navigate to monorepo root
cd /Users/seyederick/DevOps/_project_folders/lan-onasis-monorepo

# Apply the migration using Supabase CLI
supabase db push --db-url "postgresql://postgres.mxtsdgkwzjzlttpotole:***@aws-0-us-east-1.pooler.supabase.com:6543/postgres"

# Or apply directly via psql
psql "postgresql://postgres.mxtsdgkwzjzlttpotole:***@aws-0-us-east-1.pooler.supabase.com:6543/postgres" \
  -f supabase/migrations/20251211000000_auth_events_projections.sql
```

**Verify:**
```bash
# Check if auth_events table exists
psql "postgresql://postgres.mxtsdgkwzjzlttpotole:***@aws-0-us-east-1.pooler.supabase.com:6543/postgres" \
  -c "\dt public.auth_events"

# Check if RPC function exists
psql "postgresql://postgres.mxtsdgkwzjzlttpotole:***@aws-0-us-east-1.pooler.supabase.com:6543/postgres" \
  -c "\df public.apply_auth_event"
```

### Step 3: Deploy Auth Gateway with Outbox Forwarder

Deploy both the auth-gateway service and the outbox forwarder using PM2:

```bash
# Navigate to auth-gateway directory
cd apps/onasis-core/services/auth-gateway

# Build the application
npm run build

# Start with PM2 (includes both gateway and forwarder)
pm2 start ecosystem.config.cjs --env production

# Or start individually
pm2 start ecosystem.config.cjs --only auth-gateway --env production
pm2 start ecosystem.config.cjs --only outbox-forwarder --env production
```

**Verify PM2 Processes:**
```bash
pm2 list
```

Expected output:
```
┌─────┬─────────────────────┬─────────────┬─────────┬─────────┬──────────┐
│ id  │ name                │ mode        │ ↺       │ status  │ cpu      │
├─────┼─────────────────────┼─────────────┼─────────┼─────────┼──────────┤
│ 0   │ auth-gateway        │ cluster     │ 0       │ online  │ 0%       │
│ 1   │ outbox-forwarder    │ fork        │ 0       │ online  │ 0%       │
└─────┴─────────────────────┴─────────────┴─────────┴─────────┴──────────┘
```

**View Logs:**
```bash
# Auth gateway logs
pm2 logs auth-gateway

# Outbox forwarder logs
pm2 logs outbox-forwarder

# All logs
pm2 logs
```

---

## Verification & Testing

### 1. Health Check

Verify the outbox is being monitored:

```bash
curl http://localhost:4000/health | jq
```

**Expected Response:**
```json
{
  "status": "ok",
  "service": "auth-gateway",
  "database": {
    "healthy": true,
    "latency_ms": 12
  },
  "cache": {
    "healthy": true
  },
  "outbox": {
    "pending": 0,
    "failed": 0,
    "oldest_pending_seconds": null
  },
  "timestamp": "2025-12-11T10:30:45.123Z"
}
```

### 2. Trigger Test Events

Create a test session to generate events:

```bash
# Test user login (creates UserUpserted + SessionCreated events)
curl -X POST http://localhost:4000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@lanonasis.com",
    "password": "test123"
  }'
```

### 3. Check Event Flow

**Check Neon Events Table:**
```bash
psql "$DATABASE_URL" -c "
  SELECT event_id, aggregate_type, event_type, occurred_at
  FROM auth_gateway.events
  ORDER BY occurred_at DESC
  LIMIT 5;
"
```

**Check Neon Outbox Table:**
```bash
psql "$DATABASE_URL" -c "
  SELECT o.id, o.event_id, o.status, o.attempts, e.event_type
  FROM auth_gateway.outbox o
  JOIN auth_gateway.events e ON e.event_id = o.event_id
  ORDER BY o.id DESC
  LIMIT 5;
"
```

**Check Supabase Events Table:**
```bash
psql "postgresql://postgres.mxtsdgkwzjzlttpotole:***@aws-0-us-east-1.pooler.supabase.com:6543/postgres" -c "
  SELECT event_id, aggregate_type, event_type, occurred_at, ingested_at
  FROM public.auth_events
  ORDER BY ingested_at DESC
  LIMIT 5;
"
```

**Check Supabase Projections:**
```bash
# Auth users view
psql "postgresql://postgres.mxtsdgkwzjzlttpotole:***@aws-0-us-east-1.pooler.supabase.com:6543/postgres" -c "
  SELECT user_id, email, role, last_updated_at
  FROM public.auth_users_view;
"

# Auth sessions view
psql "postgresql://postgres.mxtsdgkwzjzlttpotole:***@aws-0-us-east-1.pooler.supabase.com:6543/postgres" -c "
  SELECT session_id, user_id, platform, expires_at
  FROM public.auth_sessions_view;
"
```

### 4. Monitor Outbox Forwarder

Watch the forwarder logs in real-time:

```bash
pm2 logs outbox-forwarder --lines 50
```

**Expected Log Output:**
```
Outbox forwarder: delivering 3 event(s)
Outbox forwarder: delivered event abc-123 -> supabase
Outbox forwarder: delivered event def-456 -> supabase
Outbox forwarder: delivered event ghi-789 -> supabase
```

---

## Monitoring

### Key Metrics

1. **Outbox Depth** (via `/health` endpoint)
   - `pending`: Number of events waiting to be forwarded
   - `failed`: Number of events that failed after max retries
   - `oldest_pending_seconds`: Age of oldest pending event

2. **Event Throughput**
   ```bash
   # Events created per hour (Neon)
   psql "$DATABASE_URL" -c "
     SELECT
       DATE_TRUNC('hour', occurred_at) AS hour,
       COUNT(*) AS events
     FROM auth_gateway.events
     WHERE occurred_at > NOW() - INTERVAL '24 hours'
     GROUP BY hour
     ORDER BY hour DESC;
   "
   ```

3. **Ingestion Lag**
   ```bash
   # Time between event creation and ingestion (Supabase)
   psql "postgresql://postgres.mxtsdgkwzjzlttpotole:***@aws-0-us-east-1.pooler.supabase.com:6543/postgres" -c "
     SELECT
       AVG(EXTRACT(EPOCH FROM (ingested_at - occurred_at))) AS avg_lag_seconds,
       MAX(EXTRACT(EPOCH FROM (ingested_at - occurred_at))) AS max_lag_seconds
     FROM public.auth_events
     WHERE ingested_at > NOW() - INTERVAL '1 hour';
   "
   ```

### Alerts

Set up alerts for:
- **Outbox depth > 100**: Events are not being processed fast enough
- **Failed events > 0**: Events are consistently failing after retries
- **Ingestion lag > 60s**: Forwarder may be down or Supabase is slow
- **Oldest pending > 300s**: Events are stuck in the outbox

### Dashboard Queries

**Event Statistics (Supabase):**
```sql
SELECT * FROM public.get_auth_events_stats();
```

**Failed Outbox Events (Neon):**
```sql
SELECT
  o.id,
  o.event_id,
  e.event_type,
  o.attempts,
  o.error,
  o.updated_at
FROM auth_gateway.outbox o
JOIN auth_gateway.events e ON e.event_id = o.event_id
WHERE o.status = 'failed'
ORDER BY o.updated_at DESC;
```

---

## Troubleshooting

### Outbox Forwarder Not Running

**Symptom:** Events are created in Neon but not appearing in Supabase.

**Check:**
```bash
pm2 list | grep outbox-forwarder
pm2 logs outbox-forwarder --err
```

**Fix:**
```bash
pm2 restart outbox-forwarder
pm2 logs outbox-forwarder
```

### Events Stuck in Pending

**Symptom:** `outbox.pending` count keeps growing.

**Check:**
```bash
# Check oldest pending events
psql "$DATABASE_URL" -c "
  SELECT id, event_id, attempts, error, next_attempt_at
  FROM auth_gateway.outbox
  WHERE status = 'pending'
  ORDER BY next_attempt_at ASC
  LIMIT 10;
"
```

**Possible Causes:**
1. **Supabase connection issue**: Check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
2. **Network timeout**: Increase forwarder timeout or check firewall rules
3. **Supabase RPC error**: Verify `apply_auth_event` function exists

**Fix:**
```bash
# Manually retry failed events
npm run outbox:forward

# Or reset attempts for debugging
psql "$DATABASE_URL" -c "
  UPDATE auth_gateway.outbox
  SET attempts = 0, next_attempt_at = NOW()
  WHERE status = 'pending' AND attempts > 3;
"
```

### Duplicate Events

**Symptom:** Same event appears multiple times in Supabase.

**Check:**
```bash
# Check for duplicate event_ids (should be 0)
psql "postgresql://postgres.mxtsdgkwzjzlttpotole:***@aws-0-us-east-1.pooler.supabase.com:6543/postgres" -c "
  SELECT event_id, COUNT(*)
  FROM public.auth_events
  GROUP BY event_id
  HAVING COUNT(*) > 1;
"
```

**Cause:** Idempotency key (event_id) is not working correctly.

**Fix:** Verify `auth_events` table has PRIMARY KEY on `event_id`:
```sql
ALTER TABLE public.auth_events ADD PRIMARY KEY (event_id);
```

### Projection Views Empty

**Symptom:** `auth_users_view` or other projections return no rows despite events existing.

**Check:**
```bash
# Verify events exist
psql "postgresql://postgres.mxtsdgkwzjzlttpotole:***@aws-0-us-east-1.pooler.supabase.com:6543/postgres" -c "
  SELECT aggregate_type, event_type, COUNT(*)
  FROM public.auth_events
  GROUP BY aggregate_type, event_type;
"

# Check view definitions
psql "postgresql://postgres.mxtsdgkwzjzlttpotole:***@aws-0-us-east-1.pooler.supabase.com:6543/postgres" -c "
  \d+ public.auth_users_view
"
```

**Fix:** Refresh views or re-apply migration:
```bash
psql "postgresql://postgres.mxtsdgkwzjzlttpotole:***@aws-0-us-east-1.pooler.supabase.com:6543/postgres" \
  -f supabase/migrations/20251211000000_auth_events_projections.sql
```

---

## Next Steps

1. ✅ **Apply Neon migration** (`009_event_store.sql`)
2. ✅ **Apply Supabase migration** (`20251211000000_auth_events_projections.sql`)
3. ✅ **Start PM2 processes** (auth-gateway + outbox-forwarder)
4. ✅ **Verify event flow** (Neon → Outbox → Supabase → Projections)
5. 🔄 **Update Netlify functions** to read from Supabase projections
6. 🔄 **Update MCP routes** to use Supabase for enrichment
7. 🔄 **Set up monitoring** (alerts, dashboards)
8. 🔄 **Performance testing** (load test event ingestion)

---

## Support

For issues or questions:
- **GitHub**: [Create an issue](https://github.com/thefixer3x/lan-onasis-monorepo/issues)
- **Documentation**: `/apps/onasis-core/services/auth-gateway/AUTH_GATEWAY_CQRS_IMPLEMENTATION.md`
- **Logs**: `pm2 logs` or `/apps/onasis-core/services/auth-gateway/logs/`
