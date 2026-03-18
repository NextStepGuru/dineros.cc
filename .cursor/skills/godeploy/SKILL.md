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

- Resolve **branch name**, **commit message**, **PR title**, and **PR body**. Ask once if branch/message are missing; branch name may be derived from the change (e.g. `feat/category-management`).
- Do not run if the user is in **detached HEAD** (`git branch --show-current` empty).

### Generating commit, PR title, and PR body from the diff

When the user does not supply a commit message and/or PR title/body, derive them from the working tree and diff **before** committing:

1. **Commit message** (conventional, one line; optional second line with bullets if many changes):
   - Run `git status` and `git diff` (and after staging, `git diff --cached`) to see what changed.
   - Choose type: `feat`, `fix`, `docs`, `refactor`, `chore`, etc. Add scope if clear (e.g. `feat(registers): …`).
   - Subject: short, present-tense, imperative (e.g. "add category management" not "added").
   - Example: `feat(registers): add category management and API endpoints`.

2. **PR title** (50–72 chars, descriptive, no need to repeat "feat:"):
   - User-supplied, or expand the commit subject into a clear headline (e.g. "Add category management and API endpoints" or "Category management for registers").

3. **PR body** (short and informative):
   - User-supplied, or write 2–4 sentences or bullets summarizing: what changed, which areas (e.g. API, UI, schema), and any notable files or behaviors. Use the diff and file list to stay accurate; avoid generic filler.

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

Message: user-supplied, or generate from diff per "Generating commit, PR title, and PR body from the diff" above.

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

Title: user PR title or generated headline per above. Body: user PR body or generated summary per above. Always pass a body when using `gh pr create` or MCP if one was generated or provided.

## Reference

Reuse behavior from **branch**, **commit** (but here always `git add -A`), **push**, and **pr** skills in this repo’s `.cursor/skills/`.
