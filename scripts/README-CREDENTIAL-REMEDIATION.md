# Credential Leak Remediation Guide

This directory contains tools and documentation for addressing the accidental commit of Supabase test credentials to the Git repository.

## 📋 Quick Reference

### Files in this Package

1. **SECURITY-INCIDENT-CREDENTIAL-LEAK.md** - Full incident report with detailed remediation steps
2. **cleanup-credential-leak.sh** - Automated script to clean Git history
3. **pre-commit-hook.sh** - Hook to prevent future credential leaks
4. **setup-security-hooks.sh** - Easy installer for security hooks

## 🚨 Immediate Actions Required

### Step 1: Rotate Credentials (DO THIS FIRST!)

Before cleaning Git history, **immediately rotate** the exposed Supabase service key:

1. Go to: https://app.supabase.com
2. Select project: `mxtsdgkwzjzlttpotole`
3. Navigate to: Settings → API
4. Generate a new service role key
5. Update all production environment variables
6. Revoke the old key

**Why first?** Even after cleaning Git history, the credentials may have been exposed. They must be rotated immediately.

### Step 2: Clean Git History

Run the automated cleanup script:

```bash
cd /path/to/Onasis-CORE
./scripts/cleanup-credential-leak.sh
```

The script will:
- ✅ Guide you through the cleanup process
- ✅ Create a backup of your repository
- ✅ Remove credentials from all Git history
- ✅ Offer to force push the cleaned history

**Choose your cleanup method:**
- **Option 1**: `git-filter-repo` (Recommended - Fast and safe)
- **Option 2**: `BFG Repo-Cleaner` (Alternative - Very fast)
- **Option 3**: `git filter-branch` (Built-in - Slower)

### Step 3: Install Security Hooks

Prevent future accidents:

```bash
./scripts/setup-security-hooks.sh
```

This will:
- ✅ Install pre-commit hooks to detect credentials
- ✅ Configure git-secrets (if installed)
- ✅ Update .gitignore with security patterns

## 📖 Detailed Information

### What Credentials Were Leaked?

**Supabase Instance:**
- URL: `https://mxtsdgkwzjzlttpotole.supabase.co`
- Service Key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (full key in incident report)

**Affected Commits:**
- `376fd79` - Initial commit with credentials (Aug 21, 2025)
- `c525355` - First sanitization attempt (Aug 26, 2025)
- `42b01ef` - Second sanitization attempt

**File affected:** `MCP_SERVER_CHECKPOINT.md`

### Manual Cleanup (Alternative)

If you prefer manual cleanup or the script doesn't work:

#### Using git-filter-repo:

```bash
# Install
pip3 install git-filter-repo

# Backup
git clone --mirror . ../Onasis-CORE-backup

# Clean
git filter-repo --replace-text <(echo "REDACTED_JWT==>***REMOVED***")

# Force push
git push origin --force --all
git push origin --force --tags
```

#### Using BFG Repo-Cleaner:

```bash
# Download
wget https://repo1.maven.org/maven2/com/madgag/bfg/1.14.0/bfg-1.14.0.jar

# Create passwords file
echo "REDACTED_JWT" > passwords.txt

# Clean
java -jar bfg-1.14.0.jar --replace-text passwords.txt

# Cleanup and push
git reflog expire --expire=now --all
git gc --prune=now --aggressive
git push origin --force --all
```

## 👥 Team Member Instructions

After history is cleaned, all team members must update their local repositories:

```bash
# Backup any local changes
git stash save "backup before history rewrite"

# Fetch cleaned history
git fetch origin

# Reset to cleaned history
git reset --hard origin/main

# Clean local references
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Restore local changes if any
git stash pop
```

## 🛡️ Prevention Measures

### Pre-commit Hooks (Installed by setup script)

The pre-commit hook checks for:
- JWT tokens (including the leaked one)
- API keys and secrets
- AWS credentials
- Common credential patterns

### Additional Tools (Optional)

**git-secrets**: Amazon's tool for preventing credential commits

```bash
# Install
brew install git-secrets  # macOS
# OR
git clone https://github.com/awslabs/git-secrets.git
cd git-secrets && make install

# Configure for this repo
git secrets --install
git secrets --register-aws
git secrets --add 'eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*'
```

**GitHub Secret Scanning**: Enable in repository settings
1. Go to: Settings → Security & analysis
2. Enable "Secret scanning"
3. Enable "Push protection"

## ✅ Verification Checklist

After completing all steps:

- [ ] Supabase service key rotated in dashboard
- [ ] Old key revoked
- [ ] New key updated in all environments
- [ ] Git history cleaned (verify with: `git log -S 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'`)
- [ ] Force push completed
- [ ] All team members notified and updated their repositories
- [ ] Pre-commit hooks installed
- [ ] GitHub secret scanning enabled
- [ ] Security incident documented
- [ ] All production services still working with new credentials

## 🆘 Troubleshooting

### "Fatal: Not a valid object name"

This means git-filter-repo has already been run. You're good to go!

### "Cannot force push"

Check you have admin permissions and that branch protection rules allow force push.

### Team member getting merge conflicts

They need to do a hard reset (see "Team Member Instructions" above).

### Pre-commit hook not triggering

Check if it's executable:
```bash
chmod +x .git/hooks/pre-commit
```

## 📚 Additional Resources

- [Full incident report](.devops/SECURITY-INCIDENT-CREDENTIAL-LEAK.md)
- [GitHub: Removing sensitive data](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
- [git-filter-repo documentation](https://github.com/newren/git-filter-repo)
- [BFG Repo-Cleaner](https://rtyley.github.io/bfg-repo-cleaner/)
- [Supabase Security Best Practices](https://supabase.com/docs/guides/platform/going-into-prod)

## 🔐 Security Best Practices

Going forward:

1. **Never commit credentials** - Use environment variables
2. **Use .env files** - Keep them in .gitignore
3. **Use placeholders in docs** - `[your_key_here]` instead of real keys
4. **Enable secret scanning** - GitHub and other tools
5. **Use pre-commit hooks** - Automated prevention
6. **Regular security audits** - Check for leaked credentials
7. **Rotate keys regularly** - Not just when leaked

## 📞 Support

If you need help with this remediation:

1. Review the full incident report: `.devops/SECURITY-INCIDENT-CREDENTIAL-LEAK.md`
2. Check the troubleshooting section above
3. Consult GitHub's documentation on removing sensitive data
4. Contact the security team if you have concerns

---

**Last Updated:** October 2, 2025
**Status:** Active Remediation
