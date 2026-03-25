#!/usr/bin/env bash
# Optional: raise open-files limit if EMFILE still occurs. Run: ulimit -n 65536
exec npx nuxt dev
