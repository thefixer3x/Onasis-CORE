# Configuration Applied - Token TTL Fix

**Date:** 2025-12-01 20:22 UTC  
**Applied By:** System Administration  
**Status:** ✅ ACTIVE

---

## Change Applied

### File Modified
`/opt/lanonasis/onasis-core/services/auth-gateway/.env`

### Configuration Added
```bash
# Token TTL Override (added 2025-12-01)
# Temporary fix: Increase access token lifetime from 15 min to 1 hour
# This buys time while frontend implements automatic token refresh
ACCESS_TOKEN_TTL_SECONDS=3600
```

---

## Verification

### Environment Check
```bash
$ node test-new-token-ttl.mjs

✅ TOKEN TTL CONFIGURATION CHECK

Environment Variables:
  ACCESS_TOKEN_TTL_SECONDS: 3600
  REFRESH_TOKEN_TTL_SECONDS: Not set (default: 2592000)
  AUTH_CODE_TTL_SECONDS: Not set (default: 300)

Calculated Values:
  Access Token Lifetime: 3600 seconds = 60 minutes
  Refresh Token Lifetime: 2592000 seconds = 30 days

✅ Status: 1-hour tokens active!
```

### PM2 Status
```bash
$ pm2 restart auth-gateway --update-env
[PM2] Applying action restartProcessId on app [auth-gateway](ids: [ 1, 2 ])
[PM2] [auth-gateway](1) ✓
[PM2] [auth-gateway](2) ✓

$ pm2 list
│ 1  │ auth-gateway  │ cluster  │ 20   │ online  │
│ 2  │ auth-gateway  │ cluster  │ 20   │ online  │
```

---

## Impact

### Before
- Access tokens expired after **15 minutes**
- Users saw "Token introspection failed" error
- Had to re-authenticate frequently
- All 115 access tokens were expired

### After
- Access tokens now last **1 hour (60 minutes)**
- Users can work for an hour without interruption
- Reduces frequency of authentication failures
- Provides time for frontend to implement proper refresh

---

## Token Lifecycle (Current)

```
User authenticates → Access token (1 hour) + Refresh token (30 days)
                             ↓
                     User works for 1 hour
                             ↓
                     Token expires after 60 minutes
                             ↓
                     ⚠️ Still needs re-auth (no auto-refresh yet)
```

---

## Next Steps

This is a **TEMPORARY FIX**. The proper solution is:

### Short-term (This Fix) ✅
- [x] Increase token TTL to 1 hour
- [x] Restart auth-gateway
- [x] Document change

### Medium-term (Required) 🔴
- [ ] Implement `refreshAccessToken()` in VSCode extension
- [ ] Update `getStoredCredentials()` to auto-refresh
- [ ] Test and deploy updated extension
- [ ] Apply to Cursor, Windsurf extensions

### Long-term (Recommended) 🟢
- [ ] Add monitoring for token refresh events
- [ ] Implement telemetry for token lifecycle
- [ ] Consider reducing TTL back to 15 minutes once refresh is working

---

## Rollback (If Needed)

If this change causes issues, rollback:

```bash
# 1. Remove the line from .env
vim /opt/lanonasis/onasis-core/services/auth-gateway/.env
# Delete: ACCESS_TOKEN_TTL_SECONDS=3600

# 2. Restart service
pm2 restart auth-gateway --update-env

# This will revert to 15-minute default
```

---

## Related Documentation

- `DATABASE-SYNC-ANALYSIS.md` - Database architecture analysis
- `TOKEN-INTROSPECTION-DIAGNOSIS.md` - Root cause analysis
- `/opt/lanonasis/INVESTIGATION-SUMMARY.md` - Complete investigation summary
- `/opt/lanonasis/VSCODE-EXTENSION-TOKEN-REFRESH-ANALYSIS.md` - Implementation guide

---

## Security Considerations

### ⚠️ Trade-offs

**Increased Token Lifetime:**
- **Security Risk:** Longer window for token compromise
- **User Benefit:** Better user experience, less re-authentication
- **Mitigation:** Temporary measure until proper refresh is implemented

**Best Practice:**
- Short-lived access tokens (15 min) ✅ Secure
- Automatic refresh with refresh tokens ✅ Secure + Good UX
- Long-lived access tokens (1 hour) ⚠️ Less secure but acceptable temporarily

### Recommendation

Once automatic token refresh is implemented in clients:
1. Test thoroughly with 15-minute tokens
2. Verify refresh mechanism works seamlessly
3. Consider reverting `ACCESS_TOKEN_TTL_SECONDS` to 900 (15 min)
4. Keep refresh token TTL at 30 days

---

## Testing

### Verify New Tokens Have 1-hour Expiry

```bash
cd /opt/lanonasis/onasis-core/services/auth-gateway
source .env

# Generate a new token (via OAuth flow or API)
# Then check database:
psql "$DATABASE_URL" -c "
  SELECT 
    token_type,
    created_at,
    expires_at,
    EXTRACT(EPOCH FROM (expires_at - created_at))/60 as lifetime_minutes
  FROM auth_gateway.oauth_tokens
  WHERE token_type = 'access'
  ORDER BY created_at DESC
  LIMIT 5;
"
```

Expected: `lifetime_minutes` should show **60** for new tokens.

---

## Monitoring

### Check Token Statistics

```bash
# Active tokens by type
psql "$DATABASE_URL" -c "
  SELECT 
    token_type,
    COUNT(*) as total,
    SUM(CASE WHEN expires_at > NOW() THEN 1 ELSE 0 END) as valid,
    SUM(CASE WHEN expires_at <= NOW() THEN 1 ELSE 0 END) as expired
  FROM auth_gateway.oauth_tokens
  GROUP BY token_type;
"

# Average token lifetime
psql "$DATABASE_URL" -c "
  SELECT 
    token_type,
    AVG(EXTRACT(EPOCH FROM (expires_at - created_at))/60) as avg_lifetime_minutes
  FROM auth_gateway.oauth_tokens
  WHERE created_at > NOW() - INTERVAL '1 day'
  GROUP BY token_type;
"
```

---

_Configuration applied and verified: 2025-12-01 20:22 UTC_
