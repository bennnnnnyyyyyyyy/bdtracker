const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const saPath = path.join(__dirname, '..', 'google2.json');
const saKey = JSON.parse(fs.readFileSync(saPath, 'utf8'));

const auth = new google.auth.JWT({
  email: saKey.client_email,
  key: saKey.private_key,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
});

const sheets = google.sheets({ version: 'v4', auth });

const CALL_SHEET_ID = process.env.CALL_DASHBOARD_SHEET_ID;
const BD_TRACKER_SHEET_ID = process.env.BD_TRACKER_SHEET_ID;

async function checkSheets() {
  console.log('Checking Call Dashboard spreadsheet:', CALL_SHEET_ID);
  try {
    const meta1 = await sheets.spreadsheets.get({ spreadsheetId: CALL_SHEET_ID });
    console.log('Call Sheet tabs:', meta1.data.sheets.map(s => s.properties.title));
  } catch (err) {
    console.error('Call Sheet error:', err.message);
  }

  console.log('\nChecking BD Tracker spreadsheet:', BD_TRACKER_SHEET_ID);
  try {
    const meta2 = await sheets.spreadsheets.get({ spreadsheetId: BD_TRACKER_SHEET_ID });
    console.log('BD Tracker tabs:', meta2.data.sheets.map(s => s.properties.title));
  } catch (err) {
    console.error('BD Tracker error:', err.message);
  }
}

checkSheets();
