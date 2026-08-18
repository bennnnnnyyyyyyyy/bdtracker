const fs = require('fs');
const os = require('os');
const path = require('path');
const { google } = require('googleapis');

const CALL_DASHBOARD_ID = '1aI0879YxZdu17GHm-QLhOoE8CuFlkpyROvCtRjjuRbw';
const BD_TRACKER_ID = '1uicpBruuFeno2ES4hNw-TIAwNkGEI37gw8Z-A4yMpC8';

async function testDriveExport() {
  const clasprcPath = path.join(os.homedir(), '.clasprc.json');
  const clasprc = JSON.parse(fs.readFileSync(clasprcPath, 'utf8'));
  const t = clasprc.tokens?.default || clasprc.token;
  const oauth2 = new google.auth.OAuth2(
    t.client_id || clasprc.oauth2ClientSettings?.clientId,
    t.client_secret || clasprc.oauth2ClientSettings?.clientSecret
  );
  oauth2.setCredentials({ refresh_token: t.refresh_token });
  const drive = google.drive({ version: 'v3', auth: oauth2 });

  console.log('Exporting Call Dashboard Sheet via Drive API...');
  const res1 = await drive.files.export(
    { fileId: CALL_DASHBOARD_ID, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    { responseType: 'arraybuffer' }
  );
  console.log('Call Dashboard Exported size:', res1.data.byteLength, 'bytes');

  console.log('Exporting BD Tracker Sheet via Drive API...');
  const res2 = await drive.files.export(
    { fileId: BD_TRACKER_ID, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    { responseType: 'arraybuffer' }
  );
  console.log('BD Tracker Exported size:', res2.data.byteLength, 'bytes');
}

testDriveExport().catch(e => console.error('Export Error:', e.message));
