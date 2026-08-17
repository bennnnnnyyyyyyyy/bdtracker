const fs = require('fs');
const { google } = require('googleapis');

// Token and credentials from BD MAIN 2026
const tokenPath = 'C:\\Users\\ben.arthur\\Desktop\\BD MAIN 2026\\auth\\token.json';
const credsPath = 'C:\\Users\\ben.arthur\\Desktop\\BD MAIN 2026\\auth\\credentials.json';

const CALL_DASHBOARD_ID = '1aI0879YxZdu17GHm-QLhOoE8CuFlkpyROvCtRjjuRbw';
const BD_TRACKER_ID = '1uicpBruuFeno2ES4hNw-TIAwNkGEI37gw8Z-A4yMpC8';

async function main() {
  const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
  const auth = google.auth.fromJSON(token);
  const sheets = google.sheets({ version: 'v4', auth });

  console.log('Testing connection to Call Dashboard Sheet...');
  try {
    const res1 = await sheets.spreadsheets.get({ spreadsheetId: CALL_DASHBOARD_ID });
    console.log('Call Dashboard Title:', res1.data.properties.title);
    console.log('Tabs:', res1.data.sheets.map(s => s.properties.title).join(', '));
  } catch (err) {
    console.error('Error fetching Call Dashboard:', err.message);
  }

  console.log('\nTesting connection to BD Tracker Sheet...');
  try {
    const res2 = await sheets.spreadsheets.get({ spreadsheetId: BD_TRACKER_ID });
    console.log('BD Tracker Title:', res2.data.properties.title);
    console.log('Tabs:', res2.data.sheets.map(s => s.properties.title).join(', '));
  } catch (err) {
    console.error('Error fetching BD Tracker:', err.message);
  }
}

main();
