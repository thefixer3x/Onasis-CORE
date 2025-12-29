# Security Vulnerabilities Review - Snyk Scan Results

**Date**: 2025-11-26  
**Scan Tool**: Snyk  
**Status**: ⚠️ **4 projects contain vulnerabilities**

---

## 🔴 Critical Issues

### 1. **body-parser@2.2.0** (Medium Severity)
**Vulnerability**: Allocation of Resources Without Limits or Throttling  
**Fixed in**: 2.2.1  
**Affected Projects**:
- `apps/onasis-core` (package-lock.json)
- `services/auth-gateway` (package-lock.json)  
- `services/security` (package-lock.json)

**Root Cause**: `express@5.1.0` depends on `body-parser@2.2.0`

**Status**: ⚠️ Override exists in root `package.json` but may not apply to npm workspaces

**Fix Required**: Add overrides to each affected service's `package.json`

---

## 🟡 Other Vulnerabilities (`.netlify/plugins`)

These are in Netlify build plugins and may be harder to fix:

### 2. **glob@10.4.5** (High Severity)
- **Vulnerability**: Command Injection
- **Fixed in**: 10.5.0, 11.1.0
- **Location**: `.netlify/plugins/package-lock.json`
- **Introduced by**: `content-security-policy-buildhooks` → `@netlify/sdk` → `@netlify/content-engine`

### 3. **inflight@1.0.6** (Medium Severity)
- **Vulnerability**: Missing Release of Resource after Effective Lifetime
- **No upgrade available**
- **Location**: `.netlify/plugins/package-lock.json`
- **Introduced by**: `devcert@1.2.2` → `glob@7.2.3`

### 4. **js-yaml@4.1.0** (Medium Severity)
- **Vulnerability**: Prototype Pollution
- **Fixed in**: 3.14.2, 4.1.1
- **Location**: `.netlify/plugins/package-lock.json`
- **Status**: ✅ Already fixed in root overrides (`js-yaml: 4.1.1`)

### 5. **lodash.set@4.3.2** (High Severity)
- **Vulnerability**: Prototype Pollution
- **No upgrade available**
- **Location**: `.netlify/plugins/package-lock.json`
- **Introduced by**: `@netlify/content-engine`

### 6. **tmp@0.0.33** (Medium Severity)
- **Vulnerability**: Symlink Attack
- **Fixed in**: 0.2.4
- **Location**: `.netlify/plugins/package-lock.json`
- **Status**: ✅ Already fixed in root overrides (`tmp: 0.2.5`)

---

## ✅ Projects with No Vulnerabilities

- `packages/shared-types` - Clean ✅

---

## ⚠️ Projects That Couldn't Be Tested

Missing `node_modules`:
- `packages/privacy-sdk`
- `packages/ui-kit`
- `server`

**Action Required**: Run `npm install` or `bun install` in these directories

---

## 🔧 Recommended Fixes

### Priority 1: Fix body-parser in all services

Add overrides to each service's `package.json`:

```json
{
  "overrides": {
    "body-parser": "^2.2.1"
  }
}
```

**Files to update**:
1. `apps/onasis-core/package.json`
2. `apps/onasis-core/services/auth-gateway/package.json`
3. `apps/onasis-core/services/security/package.json`

### Priority 2: Reinstall dependencies

After adding overrides, reinstall:
```bash
cd apps/onasis-core
bun install --force
```

### Priority 3: Netlify plugins

The `.netlify/plugins` vulnerabilities are harder to fix because:
- They're transitive dependencies of Netlify's build tools
- Some have no available fixes
- Consider removing or updating `content-security-policy-buildhooks` if not needed

---

## 📊 Summary

| Severity | Count | Status |
|----------|-------|--------|
| High | 2 | ⚠️ Needs attention |
| Medium | 4 | ⚠️ Needs attention |
| **Total** | **6** | **4 fixable** |

**Fixable**: 4 vulnerabilities (body-parser, js-yaml, tmp, glob)  
**Unfixable**: 2 vulnerabilities (inflight, lodash.set) - no upgrades available

