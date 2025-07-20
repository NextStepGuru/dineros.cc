#!/bin/bash

# Enhanced TruffleHog Security Scanner
# Outputs file locations and detected secrets

set -e

# Run scan and extract file locations with secrets
/opt/homebrew/bin/trufflehog filesystem . -x .trufflehog_excludes.txt --no-update --no-verification 2>/dev/null | \
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
