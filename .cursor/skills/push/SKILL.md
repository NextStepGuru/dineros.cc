---
name: push
description: >-
  Pushes the current branch safely: pull first (rebase preferred), then push
  using --force-with-lease so the push fails if the remote was updated. Use
  when the user asks to push, push changes, or sync to remote.
---

# Safe push

## Current branch

Resolve with: `git branch --show-current` → use as `<branch>`.

## Pull first

Run: `git pull --rebase origin <branch>`

Prefer rebase to keep linear history. If the user has asked for merge instead of rebase, use: `git pull origin <branch>`.

Resolve any pull conflicts before pushing; do not push with unresolved conflicts.

## Push with lease

- **Has upstream**: `git push --force-with-lease origin <branch>`
- **No upstream (first push)**: `git push -u origin <branch> --force-with-lease`

If push is rejected because the remote was updated (lease failure), do not use `--force`. Tell the user to pull again (rebase or merge) and retry the push.

Do not document or use `git push --force` in this workflow.
