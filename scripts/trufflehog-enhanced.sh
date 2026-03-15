#!/bin/bash

# Enhanced TruffleHog Security Scanner
# Outputs file locations and detected secrets

set -e

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

# Run scan and extract file locations with secrets
$TRUFFLEHOG_CMD filesystem . -x .trufflehog_excludes.txt --no-update --no-verification 2>/dev/null | \
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
        # Get the secret value (everything after "Raw result:")
        secret = substr($0, index($0, ":") + 2)
        print "🔑 Secret: " secret
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
