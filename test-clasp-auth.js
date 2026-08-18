const fs = require('fs');
const os = require('os');
const path = require('path');
const { google } = require('googleapis');

const CALL_DASHBOARD_ID = '1aI0879YxZdu17GHm-QLhOoE8CuFlkpyROvCtRjjuRbw';
const BD_TRACKER_ID = '1uicpBruuFeno2ES4hNw-TIAwNkGEI37gw8Z-A4yMpC8';

async function testClaspToken() {
  const clasprcPath = path.join(os.homedir(), '.clasprc.json');
  if (!fs.existsSync(clasprcPath)) {
    console.log('No clasprc.json found');
    return;
  }
  const clasprc = JSON.parse(fs.readFileSync(clasprcPath, 'utf8'));
  const t = clasprc.tokens?.default || clasprc.token;
  const oauth2 = new google.auth.OAuth2(t.client_id || clasprc.oauth2ClientSettings?.clientId, t.client_secret || clasprc.oauth2ClientSettings?.clientSecret);
  oauth2.setCredentials({ refresh_token: t.refresh_token });
  const drive = google.drive({ version: 'v3', auth: oauth2 });

  try {
    const res = await drive.files.get({ fileId: CALL_DASHBOARD_ID, fields: 'id, name' });
    console.log('SUCCESS via Clasp credentials:', res.data.name);
  } catch (err) {
    console.log('Clasp token error:', err.message);
  }
}

testClaspToken();
