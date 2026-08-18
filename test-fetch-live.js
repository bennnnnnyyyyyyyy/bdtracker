const fs = require('fs');
const os = require('os');
const path = require('path');
const { google } = require('googleapis');

const CALL_DASHBOARD_ID = '1aI0879YxZdu17GHm-QLhOoE8CuFlkpyROvCtRjjuRbw';
const BD_TRACKER_ID = '1uicpBruuFeno2ES4hNw-TIAwNkGEI37gw8Z-A4yMpC8';

async function testFetchAll() {
  const clasprcPath = path.join(os.homedir(), '.clasprc.json');
  const clasprc = JSON.parse(fs.readFileSync(clasprcPath, 'utf8'));
  const t = clasprc.tokens?.default || clasprc.token;
  const oauth2 = new google.auth.OAuth2(
    t.client_id || clasprc.oauth2ClientSettings?.clientId,
    t.client_secret || clasprc.oauth2ClientSettings?.clientSecret
  );
  oauth2.setCredentials({ refresh_token: t.refresh_token });
  const sheets = google.sheets({ version: 'v4', auth: oauth2 });

  console.log('1. Fetching Agent Mapping...');
  const mapRes = await sheets.spreadsheets.values.get({
    spreadsheetId: CALL_DASHBOARD_ID,
    range: "'Agent Mapping'!A2:B"
  });
  console.log('Mappings:', mapRes.data.values);

  console.log('2. Fetching Call Logs sample...');
  const callRes = await sheets.spreadsheets.values.get({
    spreadsheetId: CALL_DASHBOARD_ID,
    range: "'Call Logs'!A2:O10"
  });
  console.log('Call count sample:', callRes.data.values?.length);
  if (callRes.data.values?.length) {
    console.log('Sample call row:', callRes.data.values[0]);
  }

  console.log('3. Fetching BD Tracker tabs...');
  const trackerRes = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: BD_TRACKER_ID,
    ranges: ["'New Meetings'!B2:B5", "'Onboarded'!B2:B5"]
  });
  console.log('Tracker valueRanges:', trackerRes.data.valueRanges?.map(v => ({ range: v.range, values: v.values })));
}

testFetchAll().catch(e => console.error('Error:', e.message));
