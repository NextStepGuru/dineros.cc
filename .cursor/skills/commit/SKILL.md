---
name: commit
description: >-
  Creates a new commit on the current branch. Use when the user asks to commit,
  create a commit, or save changes to git. Stages and commits with a message
  (user-provided or generated from diff).
---

# Create commit

## Guard

If in detached HEAD (`git branch --show-current` is empty), abort with a clear message. Do not commit.

## Staging

Stage only what the user intends. Do not run `git add .` unless the user clearly wants all changes (e.g. "commit everything"). Prefer explicit paths when the user specified files or the conversation implies a subset.

- Stage paths: `git add <path>...` or `git add .` when appropriate.

## Commit message

- **User provided**: Use their message with `git commit -m "<message>"`.
- **Not provided**: Generate a short, present-tense message from `git diff --cached` (and optionally `git status`). Prefer conventional style (e.g. `fix(scope): description` or `feat: description`) when it fits; concise one-line is acceptable.

## Commit

Run: `git commit -m "<message>"`

If the repo has `.pre-commit-config.yaml`, the agent may mention that pre-commit hooks will run when the user commits; do not run hooks automatically unless the user asked to run them.
