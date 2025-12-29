# Git Hook: pre-receive-protect-branch

This folder contains a sample server-side Git pre-receive hook that can be
installed on a bare Git repository to protect a specific branch from
unauthorized pushes and to prevent that branch from being merged into other
branches.

Important: server-side hooks must be installed on the Git server (the bare
repository). They are not executed when present only in the working copy.

Installation (bare repository):

1. Copy the hook into the bare repository hooks directory:

   ```bash
   # on the git server
   sudo cp scripts/git-hooks/pre-receive-protect-branch.sh /path/to/repo.git/hooks/pre-receive
   sudo chmod +x /path/to/repo.git/hooks/pre-receive
   ```

2. Edit the hook to set the `PROTECTED_BRANCH` and `ALLOWED_AUTHOR_EMAILS`.

3. Test by attempting to push to the protected branch with a non-allowed
   author email (the hook will reject the push with an explanatory message).

Limitations & Notes:
- The hook checks commit author email addresses. It does not validate remote
  usernames or SSH keys. Make sure developers' Git `user.email` is accurate.
- If you use a hosting provider (GitHub/GitLab), prefer their branch
  protection rules (UI/ACL) instead of server-side hooks. Hooks only apply on
  servers you control.
- Preventing merges of the protected branch into others is best enforced by
  protecting the other branches too (require PRs and reviews). The hook tries
  to detect merges by checking ancestry, but complex histories could require
  additional logic.

If you want, I can generate sample GitHub/GitLab API commands and a template
README that shows how to lock the branch via the hosting provider UI or CLI.
