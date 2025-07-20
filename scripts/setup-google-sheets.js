#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔧 Google Sheets API Setup Guide');
console.log('================================\n');

console.log('Step 1: Create a Google Cloud Project');
console.log('1. Go to https://console.cloud.google.com/');
console.log('2. Create a new project or select an existing one');
console.log('3. Enable the Google Sheets API for your project\n');

console.log('Step 2: Create OAuth 2.0 Credentials');
console.log('1. Go to https://console.cloud.google.com/apis/credentials');
console.log('2. Click "Create Credentials" → "OAuth client ID"');
console.log('3. Choose "Desktop application" as the application type');
console.log('4. Download the JSON credentials file');
console.log('5. Rename it to "google-sheets-credentials.json"');
console.log('6. Place it in the scripts/ directory\n');

console.log('Step 3: Create a Google Sheets Document');
console.log('1. Go to https://docs.google.com/spreadsheets/');
console.log('2. Create a new spreadsheet');
console.log('3. Share it with your Google account (or make it public for testing)');
console.log('4. Copy the spreadsheet ID from the URL');
console.log('   (The ID is the long string between /d/ and /edit in the URL)\n');

console.log('Step 4: Set Environment Variables');
console.log('Create a .env file in the scripts/ directory with:');
console.log('');
console.log('GOOGLE_SHEETS_SPREADSHEET_ID=your_spreadsheet_id_here');
console.log('ACCOUNT_REGISTER_ID=your_account_register_id_here');
console.log('API_BASE_URL=http://localhost:3000');
console.log('API_TOKEN=your_api_token_here (if required)');
console.log('SHEET_NAME=Register Data (optional, defaults to "Register Data")');
console.log('');

console.log('Step 5: Install Dependencies');
console.log('Run: npm install (in the scripts/ directory)');
console.log('');

console.log('Step 6: Run the Sync');
console.log('Run: npm run sync');
console.log('');

console.log('📝 Notes:');
console.log('- The first time you run the script, it will prompt for OAuth authorization');
console.log('- The script will create a token file for future use');
console.log('- You can run this script manually or set up a cron job for automation');
console.log('- For production, consider using a service account instead of OAuth');
console.log('');

// Check if credentials file exists
const credentialsPath = path.join(__dirname, 'google-sheets-credentials.json');
if (!fs.existsSync(credentialsPath)) {
  console.log('❌ google-sheets-credentials.json not found!');
  console.log('Please follow Step 2 to create and download the credentials file.');
} else {
  console.log('✅ google-sheets-credentials.json found!');
}

// Check if .env file exists
const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
  console.log('❌ .env file not found!');
  console.log('Please create a .env file with the required environment variables.');
} else {
  console.log('✅ .env file found!');
}

console.log('\n🎯 Ready to sync your register data to Google Sheets!');
