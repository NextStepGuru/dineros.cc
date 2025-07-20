#!/bin/sh

# Directory where replacements should occur
TARGET_DIR="./"

# Define replacements as a simple list (no arrays in /bin/sh)
replacements="src/routes dist/routes
src/middleware dist/middleware
src/bullmq dist/bullmq
src/schemas dist/schemas
\"src \"dist"

# Use find to locate all files in the target directory, excluding node_modules, and perform replacements
find "$TARGET_DIR" -type f ! -path "*/node_modules/*" | while read -r file; do
  echo "Processing $file..."
  echo "$replacements" | while read -r search replace; do
    # Perform the replacement in each file
    sed -i "s|$search|$replace|g" "$file"
  done
done

echo "Replacements completed in files within $TARGET_DIR"
