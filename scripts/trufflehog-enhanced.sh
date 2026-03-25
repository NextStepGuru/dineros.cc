#!/bin/bash

# Enhanced TruffleHog Security Scanner
# Outputs file locations and detected secrets. Exits non-zero when any secret is found.

set -e
set -o pipefail

# Find trufflehog command (check PATH first, then macOS-specific location)
if command -v trufflehog &> /dev/null; then
  TRUFFLEHOG_CMD="trufflehog"
elif command -v trufflehog3 &> /dev/null; then
  TRUFFLEHOG_CMD="trufflehog3"
elif [ -f "/opt/homebrew/bin/trufflehog" ]; then
  TRUFFLEHOG_CMD="/opt/homebrew/bin/trufflehog"
else
  echo "Error: trufflehog not found. Please install trufflehog or trufflehog3."
  exit 1
fi

# Use custom detectors (Plaid, env secrets) when present; run from repo root
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TRUFFLEHOG_CONFIG=""
if [ -f "$REPO_ROOT/.trufflehog-detectors.yaml" ]; then
  TRUFFLEHOG_CONFIG="--config=$REPO_ROOT/.trufflehog-detectors.yaml"
fi

# Catch more: no entropy filter, deeper decode. Set TRUFFLEHOG_STRICT=1 to use defaults (entropy filter, depth 5).
if [[ "${TRUFFLEHOG_STRICT:-0}" = "1" ]]; then
  ENTROPY_FLAG=""
  DEPTH_FLAG=""
else
  ENTROPY_FLAG="--filter-entropy=0"
  DEPTH_FLAG="--max-decode-depth=7"
fi
[[ -n "${TRUFFLEHOG_FILTER_ENTROPY:-}" ]] && ENTROPY_FLAG="--filter-entropy=$TRUFFLEHOG_FILTER_ENTROPY"
[[ -n "${TRUFFLEHOG_DECODE_DEPTH:-}" ]] && DEPTH_FLAG="--max-decode-depth=$TRUFFLEHOG_DECODE_DEPTH"

# Run scan. --fail exits 183 when any result found. --fail-on-scan-errors exits non-zero on scan errors.
# shellcheck disable=SC2086
$TRUFFLEHOG_CMD filesystem "$REPO_ROOT" -x "$REPO_ROOT/.trufflehog_excludes.txt" \
  --no-update --no-verification --fail --fail-on-scan-errors \
  --results=verified,unverified,unknown \
  $ENTROPY_FLAG $DEPTH_FLAG $TRUFFLEHOG_CONFIG 2>&1 | \
awk '
/^File:/ {
    if (current_file != "") {
        print ""
    }
    current_file = $2
    print "📁 File: " current_file
}
/^Raw result:/ {
    if (current_file != "") {
        # Never print raw secret values to logs.
        secret = substr($0, index($0, ":") + 2)
        n = length(secret)
        if (n <= 8) {
            masked = "[REDACTED]"
        } else {
            masked = substr(secret, 1, 4) "..." substr(secret, n - 3, 4)
        }
        print "🔑 Secret: " masked " (len=" n ")"
    }
}
/^Detector Type:/ {
    if (current_file != "") {
        detector = $3
        print "🔍 Type: " detector
    }
}
END {
    if (current_file != "") {
        print ""
    }
}'
