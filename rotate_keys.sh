#!/bin/bash

# Define the file path
ENV_FILE=".env"

# Check if the .env file exists
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: $ENV_FILE not found."
  exit 1
fi

# Generate a new encryption key using `npx cloak generate` and extract only the key value
NEW_DB_ENCRYPTION_KEY=$(npx cloak generate | grep "^Key:" | awk '{print $2}')

# Check if the key generation succeeded
if [[ -z "$NEW_DB_ENCRYPTION_KEY" ]]; then
  echo "Error: Failed to generate new encryption key with 'npx cloak generate'."
  exit 1
fi

# Temporary file to store the updated .env contents
TEMP_FILE=$(mktemp)

# Array to store the old decryption keys
declare -a DECRYPTION_KEYS

# Read through the .env file line by line
while IFS= read -r line || [[ -n "$line" ]]; do
  if [[ "$line" == DB_ENCRYPTION_KEY=* ]]; then
    # Save the current DB_ENCRYPTION_KEY value
    CURRENT_DB_ENCRYPTION_KEY="${line#*=}"
  elif [[ "$line" =~ ^DB_DECRYPTION_KEY_[0-9]+= ]]; then
    # Collect existing decryption keys
    DECRYPTION_KEYS+=("${line#*=}")
  else
    # Copy non-key lines directly to the temporary file
    echo "$line" >> "$TEMP_FILE"
  fi
done < "$ENV_FILE"

# Add the current DB_ENCRYPTION_KEY to the first decryption key slot
if [[ -n "$CURRENT_DB_ENCRYPTION_KEY" ]]; then
  DECRYPTION_KEYS=("$CURRENT_DB_ENCRYPTION_KEY" "${DECRYPTION_KEYS[@]}")
fi

# Write decryption keys in the correct order, renumbering them
MAX_KEYS=3  # Set the maximum number of keys to process

for ((i=0; i<${#DECRYPTION_KEYS[@]}; i++)); do
  if (( i >= MAX_KEYS )); then
    break  # Exit the loop when the maximum number of keys is reached
  fi
  echo "DB_DECRYPTION_KEY_$((i+1))=${DECRYPTION_KEYS[i]}" >> "$TEMP_FILE"
done

# Add the new DB_ENCRYPTION_KEY (without adding it to the decryption list)
echo "DB_ENCRYPTION_KEY=${NEW_DB_ENCRYPTION_KEY}" >> "$TEMP_FILE"

# Replace the original .env file with the updated one
mv "$TEMP_FILE" "$ENV_FILE"
