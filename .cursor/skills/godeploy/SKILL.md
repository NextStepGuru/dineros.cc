---
name: godeploy
description: >-
  Full deploy-to-review flow: create a branch from the default branch, stage
  and commit all project changes, push safely, then open a PR. Trigger when the
  user says /godeploy, godeploy, or asks to branch + commit everything + push + PR in one go.
---

# /godeploy — branch, commit all, push, PR

Run these steps in order. Stop and tell the user if any step fails.

## 0. Preconditions

- Clean understanding of **branch name** and **commit message** (and optional **PR title/body**). Ask once if missing; branch name may be derived from the message (e.g. `feat/short-slug`).
- Do not run if the user is in **detached HEAD** (`git branch --show-current` empty).

## 1. Default branch

Resolve `DEFAULT` (main or master):

```bash
git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|^refs/remotes/origin/||'
```

Fallback: `main`, then `master`. Remote: `origin/<DEFAULT>`.

## 2. Create branch

```bash
git fetch origin
git checkout -b <new-branch> origin/<DEFAULT>
```

Uncommitted changes stay on the new branch. If checkout would overwrite untracked files, stop and warn.

## 3. Stage and commit everything

```bash
git add -A
```

If there is nothing to commit (`git status` clean after add), say so and **skip commit** (still push if branch has commits—unlikely on fresh branch; usually stop after explaining).

```bash
git commit -m "<message>"
```

Message: user-supplied, or short conventional line from diff (e.g. `feat: …`).

## 4. Push (safe)

`<branch>` = `git branch --show-current`

If upstream exists (`git rev-parse --abbrev-ref '@{u}' 2>/dev/null` succeeds):

```bash
git pull --rebase origin <branch>
```

Then push:

- **No upstream yet**: `git push -u origin <branch> --force-with-lease`
- **Has upstream**: `git push --force-with-lease origin <branch>`

Resolve conflicts before pushing. Never `git push --force` without lease.

## 5. Open PR

Follow the **pr** skill: resolve owner/repo from `origin`, `head` = current branch, `base` = `DEFAULT`. Prefer GitHub MCP `create_pull_request`; else `gh pr create --base <base> --head <branch> --title "..." [--body "..."]`.

Title: user PR title or first line of the latest commit.

## Reference

Reuse behavior from **branch**, **commit** (but here always `git add -A`), **push**, and **pr** skills in this repo’s `.cursor/skills/`.
