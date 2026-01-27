# Bootstrap Guide: Sync Existing Supabase Data to Neon

## Problem Statement

**Critical Integration Gap**: Users create profiles and API keys via the dashboard (stored in Supabase), but auth-gateway doesn't recognize these tokens because they were created outside its event flow.

**Root Cause**:
- Dashboard writes directly to Supabase tables
- Auth-gateway validates against Neon command-side tables
- No sync mechanism exists for pre-existing entities
- Event store has no record of dashboard-created entities

## Solution

The `bootstrap-from-supabase.ts` script solves this by:

1. ✅ Fetching existing users from Supabase (`public.simple_users`, `auth.users`)
2. ✅ Creating corresponding entries in Neon `auth_gateway.user_accounts`
3. ✅ Emitting `UserUpserted` events for each user
4. ✅ Fetching existing API keys from Supabase `public.api_keys`
5. ✅ Emitting `ApiKeyCreated` events for each key
6. ✅ Events flow through outbox to Supabase projections

**Important**: API keys remain in Supabase (source of truth). The bootstrap only emits events so the event store knows about pre-existing entities.

---

## Execution Steps (Run Once)

### Prerequisites

Ensure environment variables are set:
```bash
postgresql://<user>:<password>@<host>:<port>/<db>
https://<project-ref>.supabase.co
REDACTED_SUPABASE_SERVICE_ROLE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
```

### Step 1: Apply Supabase Migration (One-Time)

Apply the read-side migration via [Supabase Dashboard SQL Editor](https://lanonasis.supabase.co/project/mxtsdgkwzjzlttpotole/sql):

```sql
-- Paste contents of:
-- supabase/migrations/20251211000000_auth_events_projections.sql
```

**Verify**:
```bash
psql "postgresql://<user>:<password>@<host>:<port>/<db>" \
  -c "\dt public.auth_events"
```

### Step 2: Run Bootstrap Script (One-Time)

```bash
cd apps/onasis-core/services/auth-gateway

# Run the bootstrap
npm run bootstrap:supabase
```

**Expected Output**:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 Bootstrap: Sync Supabase → Neon Event Store
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📥 Fetching users from Supabase...
   ✅ Found 6 users in public.simple_users
   ✅ Bootstrapped user: user1@example.com
   ✅ Bootstrapped user: user2@example.com
   ...

🔑 Fetching API keys from Supabase...
   ✅ Found 12 active API keys
   ✅ Emitted event for API key: Production API Key (user: abc-123)
   ✅ Emitted event for API key: Dev API Key (user: def-456)
   ...

✅ Bootstrap Complete!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Users bootstrapped:      6
   API key events emitted:  12
   Sessions processed:      0

Next steps:
  1. Run outbox forwarder: npm run outbox:forward
  2. Check Supabase auth_events table for bootstrapped events
  3. Verify projections are populated
```

### Step 3: Run Outbox Forwarder (Manual Test)

```bash
# Manually trigger event delivery
npm run outbox:forward
```

**Expected Output**:
```
Outbox forwarder: delivering 18 event(s)
Outbox forwarder: delivered event abc-123 -> supabase
Outbox forwarder: delivered event def-456 -> supabase
...
```

### Step 4: Verify Event Flow

**Check Neon Events:**
```bash
psql "$DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
  SELECT event_type, COUNT(*)
  FROM auth_gateway.events
  GROUP BY event_type;
"
```

**Expected:**
```
   event_type    | count
-----------------+-------
 UserUpserted    |     6
 ApiKeyCreated   |    12
```

**Check Neon Outbox (should all be 'sent'):**
```bash
psql "$DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
  SELECT status, COUNT(*)
  FROM auth_gateway.outbox
  GROUP BY status;
"
```

**Expected:**
```
 status | count
--------+-------
 sent   |    18
```

**Check Supabase Events:**
```bash
psql "postgresql://<user>:<password>@<host>:<port>/<db>" -c "
  SELECT event_type, COUNT(*)
  FROM public.auth_events
  GROUP BY event_type;
"
```

**Check Supabase Projections:**
```bash
psql "postgresql://<user>:<password>@<host>:<port>/<db>" -c "
  SELECT user_id, email, role, last_updated_at
  FROM public.auth_users_view
  LIMIT 5;
"
```

---

## Deployment to VPS

Once bootstrap is verified locally, deploy to production:

```bash
# On VPS server
cd /path/to/lan-onasis-monorepo/apps/onasis-core
git pull origin main

# Navigate to auth-gateway
cd services/auth-gateway

# Install dependencies if needed
npm install

# Build the application
npm run build

# Run bootstrap (one-time)
npm run bootstrap:supabase

# Restart PM2 with new config (includes outbox-forwarder)
pm2 restart ecosystem.config.cjs --env production

# Verify processes
pm2 list
```

**Expected PM2 Output:**
```
┌─────┬─────────────────────┬─────────┬─────────┬──────────┐
│ id  │ name                │ mode    │ ↺       │ status   │
├─────┼─────────────────────┼─────────┼─────────┼──────────┤
│ 0   │ auth-gateway        │ cluster │ 0       │ online   │
│ 1   │ outbox-forwarder    │ fork    │ 0       │ online   │
└─────┴─────────────────────┴─────────┴─────────┴──────────┘
```

---

## Testing with Real API Keys

After bootstrap and deployment, test with a dashboard-created API key:

```bash
# Test API key validation (should now work!)
curl -X GET https://auth.lanonasis.com/v1/auth/introspect \
  -H "Authorization: Bearer lano_sk_live_abc123xyz"
```

**Expected Response:**
```json
{
  "active": true,
  "user_id": "abc-123-def-456",
  "scope": "authenticated",
  "client_id": "dashboard",
  "exp": 1735728000
}
```

---

## Idempotency

The bootstrap script is **idempotent** - safe to run multiple times:

- User upserts use `ON CONFLICT DO UPDATE`
- Supabase uses `event_id` as primary key (duplicates ignored)
- Events already in `sent` status are skipped

---

## Troubleshooting

### "Bootstrap found 0 users/keys"

**Check Supabase tables:**
```bash
# Verify users exist
npx supabase db:query "SELECT COUNT(*) FROM public.simple_users;"

# Verify API keys exist
npx supabase db:query "SELECT COUNT(*) FROM public.api_keys WHERE is_active = true;"
```

### "Events stuck in 'pending' status"

**Check outbox forwarder logs:**
```bash
pm2 logs outbox-forwarder --lines 50
```

**Manually retry:**
```bash
npm run outbox:forward
```

### "Supabase connection failed"

**Verify environment variables:**
```bash
echo $SUPABASE_URL=https://<project-ref>.supabase.co
echo $SUPABASE_SERVICE_ROLE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
```

---

## Next Steps After Bootstrap

1. ✅ **Verify auth-gateway recognizes dashboard-created API keys**
2. ✅ **Monitor PM2 outbox-forwarder logs** for continuous event delivery
3. ✅ **Check health endpoint** for outbox metrics:
   ```bash
   curl https://auth.lanonasis.com/health | jq .outbox
   ```
4. ✅ **Update Netlify functions/MCP routes** to read from Supabase projections

---

## Related Documentation

- **Full Implementation**: `CQRS_IMPLEMENTATION_SUMMARY.md`
- **Deployment Guide**: `EVENT_SOURCING_DEPLOYMENT_GUIDE.md`
- **Bootstrap Script**: `scripts/bootstrap-from-supabase.ts`
- **Neon Migration**: `migrations/009_event_store.sql`
- **Supabase Migration**: `supabase/migrations/20251211000000_auth_events_projections.sql`
