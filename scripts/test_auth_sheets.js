const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

async function run() {
  const saKey = JSON.parse(fs.readFileSync('google2.json', 'utf8'));
  const auth = new google.auth.JWT({
    email: saKey.client_email,
    key: saKey.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
  });
  const sheets = google.sheets({ version: 'v4', auth });
  
  console.log('Authenticating...');
  await auth.authorize();
  console.log('Authorized successfully!');

  const callSheetId = process.env.CALL_DASHBOARD_SHEET_ID;
  console.log('Reading Call Sheet tabs...');
  const res = await sheets.spreadsheets.get({ spreadsheetId: callSheetId });
  console.log('Tabs in Call Sheet:', res.data.sheets.map(s => s.properties.title));

  // If Daily Totals exists, read it
  const hasDaily = res.data.sheets.some(s => s.properties.title === 'Daily Totals');
  if (hasDaily) {
    const dailyRes = await sheets.spreadsheets.values.get({
      spreadsheetId: callSheetId,
      range: `'Daily Totals'!A1:L20`
    });
    console.log('Daily Totals sample:', dailyRes.data.values);
  }
}

run().catch(console.error);
