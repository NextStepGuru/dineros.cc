---
type: Entity
title: handle-nuxt-path
description: Dev-only: handle GET /_nuxt/ (no filename) to avoid 404 request error.
generated: { by: agent/okf-generator, at: 2026-09-14T06:50:14Z }
---

# handle-nuxt-path

Dev-only: handle GET /_nuxt/ (no filename) to avoid 404 request error.

## Docstring

Dev-only: handle GET /_nuxt/ (no filename) to avoid 404 request error.
The Nuxt/Vite dev server returns 404 for this path before Nitro runs;
addDevServerHandler registers a handler that is checked before the 404 (see nuxt#31646).

## Relationships

| Type | Target |
|------|--------|
| related | setup |
| related | h3 |
| related | @nuxt/kit |
