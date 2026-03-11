---
name: rebase
description: >-
  Rebases the current branch onto the default branch (main or master). Use when
  the user asks to rebase, rebase onto main/master, or update branch with
  latest default. Fails if current branch is the default.
---

# Rebase onto default branch

## Guard

If current branch is `main` or `master`, abort with: "Do not rebase the default branch." Do not run rebase.

## Resolve default branch

Detect the repo default (user can override, e.g. "rebase onto main"):

```bash
git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|^refs/remotes/origin/||'
# Or: git remote show origin | grep 'HEAD branch' | cut -d' ' -f5
# Fallback: master, then main
```

Use result as `DEFAULT`; upstream ref is `origin/<DEFAULT>`.

## Workflow

1. **Fetch**: `git fetch origin`
2. **Rebase**: `git rebase origin/<DEFAULT>`
3. **Conflicts**: Do not auto-resolve. Tell the user to fix conflicts, then run `git rebase --continue` (or `git rebase --abort` to cancel).

## Example

Current branch: `feature/auth`, default: `master` → `git fetch origin` then `git rebase origin/master`.
