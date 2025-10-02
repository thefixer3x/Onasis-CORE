# URGENT: Credential Leak - Action Required

**Date:** October 2, 2025  
**Status:** 🔴 REQUIRES IMMEDIATE ACTION  
**Priority:** CRITICAL

---

## TL;DR - What You Need To Do

### 1️⃣ ROTATE CREDENTIALS NOW (5 minutes)
Go to https://app.supabase.com and rotate the service key for project `mxtsdgkwzjzlttpotole`

### 2️⃣ RUN CLEANUP SCRIPT (10 minutes)
```bash
cd /path/to/Onasis-CORE
./scripts/cleanup-credential-leak.sh
```

### 3️⃣ INSTALL PREVENTION TOOLS (5 minutes)
```bash
./scripts/setup-security-hooks.sh
```

---

## What Happened?

Test Supabase credentials were accidentally committed to Git on **August 21, 2025**. Despite two attempts to sanitize the file (Aug 26 and later), the credentials remain in the Git history.

### Exposed Credentials

**Supabase Service Key** (full admin access):
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14dHNkZ2t3emp6bHR0cG90b2xlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzEwNTI1OSwiZXhwIjoyMDYyNjgxMjU5fQ.Aoob84MEgNV-viFugZHWKodJUjn4JOQNzcSQ57stJFU
```

**Affected Commits:**
- `376fd79` - Initial commit
- `c525355` - First cleanup attempt
- `42b01ef` - Second cleanup attempt

**File:** `MCP_SERVER_CHECKPOINT.md`

---

## Why This Matters

✅ The current file uses placeholders (good!)  
❌ But credentials are still in Git history (bad!)

Anyone with repository access can:
- View the full Git history
- Extract the credentials
- Access your Supabase database with admin rights

**Databases at risk:**
- memories (vector storage)
- organizations
- projects
- api_keys
- users

---

## Step-by-Step Remediation

### Step 1: Rotate Credentials (DO THIS FIRST!)

Even after cleaning Git history, the credentials may have been exposed. They **must** be rotated immediately.

**Instructions:**
1. Go to: https://app.supabase.com
2. Select project: `mxtsdgkwzjzlttpotole`
3. Navigate to: **Settings → API**
4. Find: "Service role key" section
5. Click: **"Generate new key"**
6. Copy the new key
7. Update in all these locations:
   - Production `.env` files
   - CI/CD pipeline secrets
   - Netlify/Vercel/Railway environment variables
   - Any other deployment services
8. **Revoke the old key** in Supabase

⏱️ **Estimated time:** 5-10 minutes

---

### Step 2: Clean Git History

Run the automated cleanup script:

```bash
cd /path/to/Onasis-CORE
./scripts/cleanup-credential-leak.sh
```

The script will:
1. ✅ Create a backup of your repository
2. ✅ Guide you through 3 cleanup methods
3. ✅ Remove credentials from all Git history
4. ✅ Offer to force push the cleaned history

**Choose your method:**
- **Option 1**: git-filter-repo (Recommended)
- **Option 2**: BFG Repo-Cleaner (Fast alternative)
- **Option 3**: git filter-branch (Built-in, slower)

⏱️ **Estimated time:** 10-15 minutes

**Important:** After force pushing, all team members must update their repositories:
```bash
git fetch origin
git reset --hard origin/main
git reflog expire --expire=now --all
git gc --prune=now --aggressive
```

---

### Step 3: Install Prevention Tools

Prevent this from happening again:

```bash
./scripts/setup-security-hooks.sh
```

This will:
- ✅ Install pre-commit hooks to catch credentials
- ✅ Configure git-secrets (if installed)
- ✅ Update .gitignore if needed

⏱️ **Estimated time:** 5 minutes

---

### Step 4: Verify Success

After cleanup, verify credentials are gone:

```bash
./scripts/verify-cleanup.sh
```

This checks:
- ✅ No credentials in Git history
- ✅ No credentials in current files
- ✅ Placeholders are used in documentation
- ✅ Security measures are in place

---

## Documentation

Full documentation is available in:

1. **Security Incident Report**
   - Path: `.devops/SECURITY-INCIDENT-CREDENTIAL-LEAK.md`
   - Contains: Full timeline, impact assessment, detailed remediation steps

2. **Remediation Guide**
   - Path: `scripts/README-CREDENTIAL-REMEDIATION.md`
   - Contains: Quick reference, manual cleanup instructions, troubleshooting

3. **Available Scripts**
   - `cleanup-credential-leak.sh` - Automated cleanup
   - `verify-cleanup.sh` - Verification
   - `setup-security-hooks.sh` - Prevention tools
   - `pre-commit-hook.sh` - Git hook (installed by setup script)

---

## Checklist

Use this checklist to track your progress:

- [ ] **Rotated Supabase service key in dashboard**
- [ ] **Updated new key in all production environments**
- [ ] **Revoked old key in Supabase**
- [ ] **Ran cleanup script and chose a cleanup method**
- [ ] **Force pushed cleaned history**
- [ ] **Notified all team members to update their repositories**
- [ ] **Ran verification script (passes all checks)**
- [ ] **Installed pre-commit hooks**
- [ ] **Enabled GitHub secret scanning** (Settings → Security & analysis)
- [ ] **Confirmed all services still working with new credentials**
- [ ] **Updated security incident report with completion date**

---

## Questions?

If you encounter issues:

1. **Review the documentation:**
   - Security incident report: `.devops/SECURITY-INCIDENT-CREDENTIAL-LEAK.md`
   - Remediation guide: `scripts/README-CREDENTIAL-REMEDIATION.md`

2. **Check troubleshooting sections** in the remediation guide

3. **Consult GitHub's guide:**
   - https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository

4. **Tool documentation:**
   - git-filter-repo: https://github.com/newren/git-filter-repo
   - BFG Repo-Cleaner: https://rtyley.github.io/bfg-repo-cleaner/

---

## Timeline

| Date | Event |
|------|-------|
| Aug 21, 2025 | Initial commit with credentials (376fd79) |
| Aug 26, 2025 | First cleanup attempt (c525355) |
| Later | Second cleanup attempt (42b01ef) |
| Oct 2, 2025 | Security incident identified and documented |
| **TBD** | **Credentials rotated** ← DO THIS NOW |
| **TBD** | **Git history cleaned** ← THEN THIS |

---

## After Remediation

Once completed:

1. ✅ Update this document with completion dates
2. ✅ Mark security incident as resolved
3. ✅ Share lessons learned with team
4. ✅ Review other documentation for potential leaks
5. ✅ Schedule periodic security audits

---

**Remember:** The most important step is rotating the credentials. Do that first, even before cleaning the Git history.

---

*For detailed technical information, see: `.devops/SECURITY-INCIDENT-CREDENTIAL-LEAK.md`*
