---
name: godeploy
description: >-
  Full deploy-to-review flow: create a branch from the default branch when
  starting on that branch, otherwise keep the current non-default branch; then
  stage and commit all project changes, run pnpm lint and pnpm test until both
  pass, push safely, then open a PR. Trigger when the user says /godeploy,
  godeploy, or asks to branch + commit everything + push + PR in one go.
---

# /godeploy — optional branch, commit all, push, PR

Run only when the user says `/godeploy`, `godeploy`, or explicitly asks for the full branch + commit + push + PR flow. This skill is the exception that chains git operations with user consent for that workflow.

Run these steps in order. Stop and tell the user if any step fails (including `pnpm lint` or `pnpm test`). Fix failures and **re-run** the failed gate until it passes (see §4–5) before continuing; resolve **rebase merge conflicts** after `git pull --rebase` before pushing.

## 0. Preconditions

- Resolve **commit message**, **PR title**, and **PR body**. Resolve **branch name** only when starting from `main`/`DEFAULT` (since branch creation is skipped on other branches). Ask once if required values are missing.
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

## 2. Branch handling (conditional)

Resolve current branch:

```bash
git branch --show-current
```

- If current branch is `main` (or exactly `DEFAULT`): create a new branch from `origin/<DEFAULT>`.

  ```bash
  git fetch origin
  git checkout -b <new-branch> origin/<DEFAULT>
  ```

  Uncommitted changes stay on the new branch. If checkout would overwrite untracked files, stop and warn.

- If current branch is anything else (for example `feature/*`, `fix/*`, etc.): **skip branch creation** and continue on the current branch.

## 3. Stage and commit everything

```bash
git add -A
```

If there is nothing to commit (`git status` clean after add), say so and **skip commit** (still push if branch has commits—unlikely on fresh branch; usually stop after explaining).

```bash
git commit -m "<message>"
```

Message: user-supplied, or generate from diff per "Generating commit, PR title, and PR body from the diff" above.

## 4. Lint (must pass before push)

From the **git repository root** (where `pnpm lint` is defined):

```bash
pnpm lint
```

- If this exits non-zero, **do not push**. Fix reported issues (e.g. ESLint), commit any fixes, then re-run `pnpm lint` until it exits **0**.
- Prefer logging full command output to `./output.txt` (e.g. `pnpm lint 2>&1 | tee ./output.txt`) when the workspace workflow asks for inspectable logs.

Only proceed once `pnpm lint` succeeds.

## 5. Tests (must pass before push)

From the **git repository root** (where `pnpm test` is defined):

```bash
pnpm test
```

- If this exits non-zero, **do not push**. Fix failing tests or implementation, commit if needed, then re-run `pnpm test` until it exits **0**.
- Prefer logging full output to `./output.txt` (e.g. `pnpm test 2>&1 | tee ./output.txt`) when the workspace workflow asks for inspectable logs.
- If tests fail because the Prisma client is missing locally, run `npx prisma generate` in `app/` (or the package that owns the schema) and re-run tests—do not push until `pnpm test` is green.

Only proceed to push once `pnpm test` succeeds.

## 6. Push (safe)

`<branch>` = `git branch --show-current`

If upstream exists (`git rev-parse --abbrev-ref '@{u}' 2>/dev/null` succeeds):

```bash
git pull --rebase origin <branch>
```

Then push:

- **No upstream yet**: `git push -u origin <branch> --force-with-lease`
- **Has upstream**: `git push --force-with-lease origin <branch>`

Resolve conflicts before pushing. Never `git push --force` without lease.

## 7. Open PR

Follow the **pr** skill: resolve owner/repo from `origin`, `head` = current branch, `base` = `DEFAULT`. Prefer GitHub MCP `create_pull_request`; else `gh pr create --base <base> --head <branch> --title "..." [--body "..."]`.

Title: user PR title or generated headline per above. Body: user PR body or generated summary per above. Always pass a body when using `gh pr create` or MCP if one was generated or provided.

### Enable auto-merge (squash)

After the PR is created, enable auto-merge with squash strategy:

```bash
gh pr merge <PR_NUMBER> --auto --squash
```

This ensures the PR merges automatically once all required status checks pass.

## Reference

Reuse behavior from **branch**, **commit** (but here always `git add -A`), **push**, and **pr** skills in this repo’s `.cursor/skills/`.
