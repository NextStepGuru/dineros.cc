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
git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|^refs/remotes/origin/||'
```

Fallback: `main`, then `master`. Remote ref is `origin/<DEFAULT>`.

## Resolve branch name

Use the branch name if the user supplies one. Otherwise, **auto-generate** it from the working tree:

1. Run `git status --short` and `git diff --stat` to see what changed.
2. Derive a conventional branch name: `<type>/<scope>` where:
   - **type**: `feat`, `fix`, `refactor`, `chore`, `docs`, etc. — inferred from the nature of the changes.
   - **scope**: a short kebab-case slug summarising the change area (e.g. `budget-management`, `forecast-slider`, `login-redirect`). Use file paths, new modules, or dominant theme to pick the slug.
3. Keep the name under ~50 chars, lowercase, no spaces.
4. Do **not** ask the user — just generate and use it. Only ask if the changes are too ambiguous to name (e.g. a single whitespace-only diff).

Examples of auto-generated names:
- New budget CRUD endpoints + modal → `feat/budget-management`
- Fix login redirect after token refresh → `fix/login-redirect`
- Refactor register API to shared helpers → `refactor/register-ledger-helpers`

## Workflow

1. **Branch name**: User-supplied, or auto-generated per above.
2. **Fetch**: `git fetch origin`
3. **Create and switch**: `git checkout -b <new-branch> origin/<DEFAULT>`
   - Uncommitted changes in the working tree stay on the new branch; no stash unless switching would overwrite files.
4. **Conflicts**: If untracked files would be overwritten by the checkout, warn and abort; do not overwrite.

## Example

User: "/branch" (no name given, working tree has new auth middleware + tests)

- Auto-generated name: `feat/auth-middleware`
- DEFAULT = master
- Run: `git fetch origin` then `git checkout -b feat/auth-middleware origin/master`
