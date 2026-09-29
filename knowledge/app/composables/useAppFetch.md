---
type: Entity
title: useAppFetch
description: Server: forwards incoming Cookie (and other request context) to internal /api calls.
generated: { by: agent/okf-generator, at: 2026-09-14T06:50:14Z }
---

# useAppFetch

Server: forwards incoming Cookie (and other request context) to internal /api calls.

## Docstring

Server: forwards incoming Cookie (and other request context) to internal /api calls.
Client: uses $api (Bearer + 401 handling). Plain $fetch on SSR has no cookies.

## Relationships

| Type | Target |
|------|--------|
| related | useAppFetch |
