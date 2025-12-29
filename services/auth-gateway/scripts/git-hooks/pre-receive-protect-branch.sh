#!/usr/bin/env bash
set -euo pipefail

# Pre-receive hook to protect a specific branch from unauthorized pushes and
# to prevent that branch from being merged into other branches.
#
# Installation (on the remote bare repository):
# 1. Copy this file to /path/to/repo.git/hooks/pre-receive
# 2. chmod +x /path/to/repo.git/hooks/pre-receive
# 3. Edit PROTECTED_BRANCH and ALLOWED_AUTHOR_EMAILS below as needed.
#
# Behavior:
# - Reject any push that updates the protected branch with commits authored
#   by emails not in ALLOWED_AUTHOR_EMAILS.
# - Reject any push to other branches that includes the protected branch
#   tip as an ancestor (i.e., attempts to merge the protected branch into
#   another branch).

PROTECTED_BRANCH="protected-branch"
# Comma-separated list of allowed author emails for direct pushes to protected branch
ALLOWED_AUTHOR_EMAILS="you@yourdomain.com"

IFS=',' read -r -a ALLOWED <<< "$ALLOWED_AUTHOR_EMAILS"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

# Read refs from stdin
while read -r oldrev newrev refname; do
  # only care about branch refs
  if [[ "$refname" != refs/heads/* ]]; then
    continue
  fi

  branch=${refname#refs/heads/}

  # If updating the protected branch, ensure all new commits have allowed authors
  if [[ "$branch" == "$PROTECTED_BRANCH" ]]; then
    # If branch is being deleted, allow (oldrev != 0000... and newrev == 0000... indicates deletion)
    if [[ "$newrev" == "0000000000000000000000000000000000000000" ]]; then
      fail "Deletion of protected branch '$PROTECTED_BRANCH' is not allowed."
    fi

    # List commits being added
    commits=$(git rev-list ${oldrev}..${newrev} || true)
    for c in $commits; do
      author_email=$(git show -s --format='%ae' "$c")
      ok=false
      for a in "${ALLOWED[@]}"; do
        if [[ "$author_email" == "$a" ]]; then
          ok=true
          break
        fi
      done
      if [[ "$ok" != true ]]; then
        fail "Commit $c author <$author_email> is not allowed to push to '$PROTECTED_BRANCH'. Allowed emails: ${ALLOWED_AUTHOR_EMAILS}"
      fi
    done
  else
    # For other branches, prevent merges that include the protected branch tip
    # If protected branch exists on the server, check if its tip is ancestor of any new commit
    if git show-ref --verify --quiet "refs/heads/${PROTECTED_BRANCH}"; then
      protected_tip=$(git rev-parse refs/heads/${PROTECTED_BRANCH})
      commits=$(git rev-list ${oldrev}..${newrev} || true)
      for c in $commits; do
        # If protected_tip is ancestor of commit c, then protected branch was merged into this push
        if git merge-base --is-ancestor ${protected_tip} $c; then
          fail "Push to branch '$branch' includes commits descended from '$PROTECTED_BRANCH' (attempting to merge protected branch). This is not allowed."
        fi
      done
    fi
  fi
done

exit 0
