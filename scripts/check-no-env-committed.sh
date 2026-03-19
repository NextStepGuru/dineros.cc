#!/usr/bin/env bash
# Blocks committing any .env file except .env.example, .env.project, .env.vault
set -e
allowed='\.env\.(example|project|vault)$'
for path in $(git diff --cached --name-only); do
  if echo "$path" | grep -qE '^\.env$|^\.env\.'; then
    if ! echo "$path" | grep -qE "$allowed"; then
      echo "error: Refusing to commit $path (contains secrets). Use .env.example for templates."
      exit 1
    fi
  fi
done
exit 0
