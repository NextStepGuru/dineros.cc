---
name: pr
description: >-
  Creates a new pull request in this repository. Use when the user wants to
  open a PR, create a pull request, or push changes for review. Base branch
  defaults to the repo default (main/master) unless specified.
---

# Create pull request

## Scope

Run only when the user explicitly asks to open a PR or invokes this skill. Do not open PRs without a direct user request (see `.cursor/rules/00-global-safety.mdc`).

## Resolve repo and branches

- **Owner/repo**: From `git remote get-url origin` — parse to owner and repo name (e.g. `https://github.com/<owner>/<repo>.git`). Strip `.git` from repo if present.
- **Head**: Current branch — `git branch --show-current`
- **Base**: User-specified or default. Default = `git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|^refs/remotes/origin/||'` (fallback: `main`, then `master`).

## Title and body

From user, or from recent commits (e.g. first line of last commit for title, more commits for body). Body is optional.

## Prefer GitHub MCP

If the GitHub MCP server is available, call `create_pull_request` with:

- `owner`, `repo`, `title`, `head`, `base` (required)
- `body` (optional)
- `draft`, `maintainer_can_modify` (optional)

Check the MCP tool schema before calling (server name and required arguments).

## Fallback: gh CLI

If MCP is not available, run:

```bash
gh pr create --base <base> --head <head> --title "<title>" [--body "<body>"]
```

Requires `gh` installed and authenticated (`gh auth status`). If not authenticated, tell the user to run `gh auth login`.

## Enable auto-merge (squash)

After the PR is created, enable auto-merge with squash strategy:

```bash
gh pr merge <PR_NUMBER> --auto --squash
```

This ensures the PR merges automatically once all required status checks pass.
