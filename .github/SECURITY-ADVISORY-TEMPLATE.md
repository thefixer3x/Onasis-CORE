---
name: Security Advisory - Credential Leak
about: Template for documenting the credential leak security incident
title: '[SECURITY] Supabase Service Key Exposed in Git History'
labels: security, critical, credentials
assignees: ''
---

## 🔴 SECURITY INCIDENT: Credential Leak

**Severity:** CRITICAL  
**Status:** REQUIRES IMMEDIATE ACTION  
**Date Identified:** October 2, 2025  
**Incident ID:** CRED-LEAK-2025-10-02

---

## Summary

Supabase service key credentials were accidentally committed to the repository and remain in Git history despite sanitization attempts.

## Affected Credentials

**Type:** Supabase Service Role Key  
**Project:** mxtsdgkwzjzlttpotole  
**Expiration:** 2062-06-81 (long-lived token)  
**Access Level:** Full administrative access

## Timeline

- **Aug 21, 2025**: Initial commit with credentials (376fd79)
- **Aug 26, 2025**: First sanitization attempt (c525355)
- **Later**: Second sanitization attempt (42b01ef)
- **Oct 2, 2025**: Security incident identified and documented

## Impact

### Potential Exposure
- ⚠️ Anyone with repository access can view Git history
- ⚠️ Service key provides full admin access to Supabase instance
- ⚠️ Credentials remain valid until manually rotated

### Data at Risk
- Database tables: memories, organizations, projects, api_keys, users
- Vector memory storage with pgvector
- API key storage
- User authentication data

## Immediate Actions Required

### 1. Rotate Credentials ⏰ DO THIS FIRST
- [ ] Go to Supabase Dashboard
- [ ] Generate new service role key
- [ ] Update all production environment variables
- [ ] Revoke old key

### 2. Clean Git History
- [ ] Run cleanup script: `./scripts/cleanup-credential-leak.sh`
- [ ] Verify with: `./scripts/verify-cleanup.sh`
- [ ] Force push cleaned history

### 3. Install Prevention Measures
- [ ] Run: `./scripts/setup-security-hooks.sh`
- [ ] Enable GitHub secret scanning
- [ ] Enable push protection

### 4. Notify Team Members
- [ ] Inform all contributors about history rewrite
- [ ] Provide instructions for updating local repositories

## Documentation

Complete documentation available in:
- **Incident Report:** `.devops/SECURITY-INCIDENT-CREDENTIAL-LEAK.md`
- **Remediation Guide:** `scripts/README-CREDENTIAL-REMEDIATION.md`
- **Quick Action Guide:** `URGENT-CREDENTIAL-LEAK-ACTION-REQUIRED.md`

## Tools Provided

Automated scripts to assist with remediation:
- `scripts/cleanup-credential-leak.sh` - Clean Git history (3 methods)
- `scripts/verify-cleanup.sh` - Verify successful cleanup
- `scripts/setup-security-hooks.sh` - Install prevention tools
- `scripts/pre-commit-hook.sh` - Pre-commit hook for future prevention

## Verification Checklist

- [ ] Supabase service key rotated
- [ ] Old key revoked
- [ ] New key updated in all environments
- [ ] Git history cleaned
- [ ] Verification script passes
- [ ] Force push completed
- [ ] Team members notified and updated repositories
- [ ] Pre-commit hooks installed
- [ ] GitHub secret scanning enabled
- [ ] All services operational with new credentials

## Prevention Measures Implemented

- [x] Pre-commit hooks to detect credentials
- [x] Enhanced .gitignore patterns
- [x] Documentation updated to use placeholders only
- [x] Security incident documentation created
- [ ] GitHub secret scanning enabled (requires action)
- [ ] Team training on credential handling (recommended)

## Lessons Learned

### What Went Wrong
1. Real credentials included in documentation
2. No pre-commit hooks to catch credentials
3. Manual sanitization didn't remove from history

### What We're Doing to Prevent This
1. ✅ Created automated pre-commit hooks
2. ✅ Enhanced .gitignore patterns
3. ✅ Comprehensive documentation on secure practices
4. ✅ Verification tools to check for leaks
5. ⏳ Enabling GitHub secret scanning
6. ⏳ Team training on secure credential handling

## References

- [GitHub: Removing sensitive data](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
- [Supabase Security Best Practices](https://supabase.com/docs/guides/platform/going-into-prod)
- [git-filter-repo](https://github.com/newren/git-filter-repo)
- [BFG Repo-Cleaner](https://rtyley.github.io/bfg-repo-cleaner/)

---

## Resolution

**Status:** IN PROGRESS

### Completed
- [x] Security incident identified and documented
- [x] Remediation tools created
- [x] Documentation provided
- [x] Prevention measures implemented

### Pending
- [ ] Credentials rotated by repository owner
- [ ] Git history cleaned by repository owner
- [ ] Verification completed
- [ ] Security advisory closed

**Resolution Date:** _To be completed by repository owner_

---

**Note:** This is a high-priority security incident. The exposed service key must be rotated immediately, even before cleaning the Git history.

/cc @thefixer3x
