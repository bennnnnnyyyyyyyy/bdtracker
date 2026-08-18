const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const CALL_DASHBOARD_ID = '1aI0879YxZdu17GHm-QLhOoE8CuFlkpyROvCtRjjuRbw';
const BD_TRACKER_ID = '1uicpBruuFeno2ES4hNw-TIAwNkGEI37gw8Z-A4yMpC8';

async function testServiceAccount() {
  const saKey = JSON.parse(fs.readFileSync('tribal-quest-484611-j3-a4a4f21e24ed.json', 'utf8'));
  const auth = new google.auth.JWT({
    email: saKey.client_email,
    key: saKey.private_key,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets.readonly',
      'https://www.googleapis.com/auth/drive.readonly'
    ]
  });

  const sheets = google.sheets({ version: 'v4', auth });

  console.log('1. Testing Call Dashboard Sheet access...');
  try {
    const res1 = await sheets.spreadsheets.get({ spreadsheetId: CALL_DASHBOARD_ID });
    console.log('SUCCESS Call Dashboard Title:', res1.data.properties.title);
    console.log('Tabs:', res1.data.sheets.map(s => s.properties.title).join(', '));
  } catch (e) {
    console.error('Call Dashboard Error:', e.message);
  }

  console.log('\n2. Testing BD Tracker Sheet access...');
  try {
    const res2 = await sheets.spreadsheets.get({ spreadsheetId: BD_TRACKER_ID });
    console.log('SUCCESS BD Tracker Title:', res2.data.properties.title);
    console.log('Tabs:', res2.data.sheets.map(s => s.properties.title).join(', '));
  } catch (e) {
    console.error('BD Tracker Error:', e.message);
  }
}

testServiceAccount();
