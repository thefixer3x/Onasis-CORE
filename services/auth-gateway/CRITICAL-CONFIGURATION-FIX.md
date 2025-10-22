# 🚨 CRITICAL: Foreign Key Constraint Fix Required

**Date**: 2025-10-22  
**Priority**: 🔥 **IMMEDIATE ACTION REQUIRED**

---

## ⚡ **THE ISSUE**

**Update**: MaaS Dashboard is **correctly configured** to use auth gateway. The real issue is **empty `auth.users` table** causing foreign key constraint failures.

### Current (Wrong) Flow:
```
MaaS Dashboard → Supabase Direct (mxtsdgkwzjzlttpotole.supabase.co)
```

### Intended (Correct) Flow:  
```
MaaS Dashboard → auth.lanonasis.com:9999 → Supabase
```

---

## 🔧 **IMMEDIATE FIX**

### **File to Update:**
```
/Users/Seye/Documents/REPO Collection/MaaS-dashboard/src/integrations/supabase/client.ts
```

### **Line 6 - Change This:**
```typescript
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://mxtsdgkwzjzlttpotole.supabase.co";
```

### **To This:**
```typescript
const AUTH_GATEWAY_URL = import.meta.env.VITE_AUTH_GATEWAY_URL || "https://auth.lanonasis.com";
```

### **Environment Variables (Netlify):**

**Add/Update:**
```bash
VITE_AUTH_GATEWAY_URL=https://auth.lanonasis.com
VITE_USE_CENTRAL_AUTH=true
VITE_USE_DIRECT_AUTH=false
```

**Remove/Disable:**
```bash
# VITE_SUPABASE_URL=https://mxtsdgkwzjzlttpotole.supabase.co  # Comment out
# VITE_SUPABASE_ANON_KEY=...  # Comment out
```

---

## 🎯 **EXPECTED RESULT**

After this fix:
- ✅ MaaS Dashboard will use your deployed auth gateway
- ✅ Authentication will flow through auth.lanonasis.com
- ✅ Sessions will be properly managed in Neon database
- ✅ Your VPS auth deployment will be utilized

---

## ⚡ **QUICK DEPLOY**

```bash
cd "/Users/Seye/Documents/REPO Collection/MaaS-dashboard"

# 1. Update the client.ts file (manual edit)
# 2. Update Netlify environment variables  
# 3. Deploy
npm run build
netlify deploy --prod --dir=dist
```

---

## 📍 **WHY THIS MATTERS**

Your VPS auth gateway at `auth.lanonasis.com:9999` is:
- ✅ **Deployed and working**
- ✅ **Admin access functional** 
- ✅ **App registration working**
- ❌ **Not being used by clients!**

This fix will **connect your deployed infrastructure** to your client applications.

---

**This is a 10-minute configuration fix that will solve the authentication architecture.**