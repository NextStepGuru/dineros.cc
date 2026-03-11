---
name: branch
description: >-
  Creates a new branch from the default branch (main or master) and keeps
  uncommitted changes on the new branch. Use when the user wants to create a
  branch, start a new branch from main/master, or move uncommitted work to a
  new branch.
---

# Create branch from default

## Resolve default branch

Detect the repo default branch (user can override, e.g. "branch from main"):

```bash
# Prefer symbolic-ref; fallback remote show; then master, then main
git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|^refs/remotes/origin/||'
# Or: git remote show origin | grep 'HEAD branch' | cut -d' ' -f5
```

Use the result as `DEFAULT` (e.g. `master` or `main`). Remote ref is `origin/<DEFAULT>`.

## Workflow

1. **Branch name**: Get from user or ask (e.g. "create branch feature/xyz").
2. **Fetch**: `git fetch origin`
3. **Create and switch**: `git checkout -b <new-branch> origin/<DEFAULT>`
   - Uncommitted changes in the working tree stay on the new branch; no stash unless switching would overwrite files.
4. **Conflicts**: If untracked files would be overwritten by the checkout, warn and abort; do not overwrite.

## Example

User: "Create a branch called feature/auth from master"

- DEFAULT = master (from detection or user said "from master")
- Run: `git fetch origin` then `git checkout -b feature/auth origin/master`
