# Security Incident Report: Accidental Credential Commit

**Date:** October 2, 2025
**Severity:** HIGH  
**Status:** IN REMEDIATION
**Incident ID:** CRED-LEAK-2025-10-02

## Executive Summary

Test Supabase credentials were accidentally committed to the Git repository and remain in the version control history despite attempts to sanitize them. Immediate action is required to rotate the credentials and clean the Git history.

## Affected Credentials

**Supabase Instance:**
- URL: `https://mxtsdgkwzjzlttpotole.supabase.co`
- Service Key: `[REDACTED_SUPABASE_SERVICE_KEY]

## Timeline

- **Aug 21, 2025 (376fd79)**: Credentials initially committed in `MCP_SERVER_CHECKPOINT.md`
- **Aug 26, 2025 (c525355)**: First sanitization attempt (replaced with placeholder)
- **Later (42b01ef)**: Second sanitization attempt
- **Oct 2, 2025**: Security incident identified and documented

## Commits Containing Leaked Data

1. `376fd79dc192ff05dcf01bf4b43df0744bd2e827` - Initial commit
2. `c525355c797c085e2d4e251850bcb55c9d72c6c7` - First sanitization
3. `42b01ef...` - Second sanitization

**File affected:** `MCP_SERVER_CHECKPOINT.md`

## Impact Assessment

### Potential Exposure
- ✅ The credentials are marked as "test credentials" in the issue
- ⚠️ Anyone with access to the repository history can view these credentials
- ⚠️ Service key provides full administrative access to the Supabase instance
- ⚠️ Credentials remain valid until manually rotated

### Data at Risk
- Database tables: memories, organizations, projects, api_keys, users
- Vector memory storage with pgvector
- API key storage
- User authentication data

## Immediate Actions Required

### 1. CRITICAL: Rotate Supabase Credentials (FIRST PRIORITY)

**Steps to rotate Supabase service key:**

1. Go to Supabase Dashboard: https://app.supabase.com
2. Select project: `mxtsdgkwzjzlttpotole`
3. Navigate to: Settings → API
4. Under "Service role key" section, click "Generate new key"
5. Update the key in your production environment variables
6. Revoke the old key

**Update environment variables in:**
- Production servers
- CI/CD pipelines
- Local development `.env` files (not committed)
- Any deployment services (Netlify, Vercel, Railway, etc.)

### 2. Clean Git History

Since the credentials exist in Git history, they must be completely removed. Choose one of these methods:

#### Option A: Using git-filter-repo (Recommended)

```bash
# Install git-filter-repo
pip install git-filter-repo

# Backup your repository first
cd /path/to/Onasis-CORE
git clone --mirror . ../Onasis-CORE-backup

# Remove the sensitive data
git filter-repo --path MCP_SERVER_CHECKPOINT.md --invert-paths-callback '
  lambda blob: blob.data.replace(
    b"[REDACTED_SUPABASE_SERVICE_KEY]",
    b"[REDACTED]"
  )
'

# Force push the cleaned history
git push origin --force --all
git push origin --force --tags
```

#### Option B: Using BFG Repo-Cleaner (Alternative)

```bash
# Download BFG
wget https://repo1.maven.org/maven2/com/madgag/bfg/1.14.0/bfg-1.14.0.jar

# Create a file with the sensitive string
echo "[REDACTED_SUPABASE_SERVICE_KEY]" > passwords.txt

# Run BFG
java -jar bfg-1.14.0.jar --replace-text passwords.txt Onasis-CORE

# Clean up and force push
cd Onasis-CORE
git reflog expire --expire=now --all
git gc --prune=now --aggressive
git push origin --force --all
```

#### Option C: Rewrite Specific Commits (Most Surgical)

```bash
# Create a backup first
git clone --mirror . ../Onasis-CORE-backup

# Use filter-branch to rewrite history
git filter-branch --tree-filter '
  if [ -f MCP_SERVER_CHECKPOINT.md ]; then
    sed -i "s/[REDACTED_SUPABASE_SERVICE_KEY]" MCP_SERVER_CHECKPOINT.md
  fi
' --tag-name-filter cat -- --all

# Remove original refs
git for-each-ref --format="%(refname)" refs/original/ | xargs -n 1 git update-ref -d

# Expire reflog and garbage collect
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Force push
git push origin --force --all
git push origin --force --tags
```

### 3. Notify Team Members

After force pushing the cleaned history, all team members must:

```bash
# Backup local work
git stash save "backup before history rewrite"

# Fetch cleaned history
git fetch origin

# Reset to cleaned history
git reset --hard origin/main  # or your branch name

# Clean local references
git reflog expire --expire=now --all
git gc --prune=now --aggressive
```

### 4. GitHub Security Advisory

After cleaning:
1. Go to: https://github.com/thefixer3x/Onasis-CORE/security/advisories
2. Create a security advisory noting the credential leak
3. Mark it as resolved after cleanup is complete

## Prevention Measures

### 1. Pre-commit Hooks

Install git-secrets or similar tools:

```bash
# Install git-secrets
git clone https://github.com/awslabs/git-secrets.git
cd git-secrets
make install

# Setup in repository
cd /path/to/Onasis-CORE
git secrets --install
git secrets --register-aws
git secrets --add 'eyJhbGci[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*'
```

### 2. Update .gitignore

Ensure these patterns are in `.gitignore`:

```
.env
.env.local
.env.*.local
*.key
*.pem
secrets/
credentials/
```

### 3. Environment Variable Management

**Never commit:**
- `.env` files with real credentials
- API keys
- Database credentials
- Service keys

**Always use:**
- `.env.example` or `.env.template` with placeholder values
- Environment variables in production
- Secret management services (AWS Secrets Manager, HashiCorp Vault, etc.)

### 4. Documentation Updates

Update all documentation to:
- Use placeholders: `[your_service_key_here]`
- Reference environment variables
- Never include actual credentials in examples

### 5. Secret Scanning

Enable GitHub secret scanning:
1. Go to: Settings → Security & analysis
2. Enable "Secret scanning"
3. Enable "Push protection"

## Verification Checklist

After completing remediation:

- [ ] Supabase service key rotated
- [ ] Old key revoked in Supabase dashboard
- [ ] Git history cleaned using one of the methods above
- [ ] Force push completed
- [ ] All team members have updated their local repositories
- [ ] GitHub secret scanning enabled
- [ ] Pre-commit hooks installed
- [ ] `.gitignore` updated
- [ ] Documentation reviewed for any other credential leaks
- [ ] Security advisory created (if applicable)
- [ ] Incident documented in security logs

## Additional Resources

- [GitHub: Removing sensitive data](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
- [git-filter-repo documentation](https://github.com/newren/git-filter-repo)
- [BFG Repo-Cleaner](https://rtyley.github.io/bfg-repo-cleaner/)
- [Supabase Security Best Practices](https://supabase.com/docs/guides/platform/going-into-prod)

## Sign-off

**Incident Reporter:** GitHub Copilot Agent  
**Date:** October 2, 2025  
**Next Review:** After remediation completion

---

**NOTE:** This is a high-priority security incident. The exposed service key provides full administrative access to the Supabase instance and must be rotated immediately, even before cleaning the Git history.
