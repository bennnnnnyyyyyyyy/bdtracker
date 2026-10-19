const fs = require('fs');
const xlsx = require('xlsx');
const path = require('path');
const { google } = require('googleapis');
const { createClient } = require('@supabase/supabase-js');

const saKey = JSON.parse(fs.readFileSync('google2.json', 'utf8'));
const auth = new google.auth.JWT({
  email: saKey.client_email,
  key: saKey.private_key,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
});
const sheets = google.sheets({ version: 'v4', auth });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const BD_TRACKER_SHEET_ID = process.env.BD_TRACKER_SHEET_ID;

async function traceLeads() {
  console.log('Fetching New Meetings from Google Sheets...');
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: BD_TRACKER_SHEET_ID,
    range: `'New Meetings'!A1:N30`
  });
  const rows = res.data.values || [];
  const headers = (rows[0] || []).map(h => String(h || '').trim().toLowerCase());
  console.log('Headers:', headers);

  const compIdx = headers.findIndex(h => h.includes('company'));
  const phoneIdx = headers.findIndex(h => h.includes('phone'));
  const dateIdx = headers.findIndex(h => h.includes('date added') || h.includes('date'));
  const openerIdx = headers.findIndex(h => h.includes('opener'));
  const notesIdx = headers.findIndex(h => h.includes('summary') || h.includes('notes'));

  console.log(`Indices: comp=${compIdx}, phone=${phoneIdx}, date=${dateIdx}, opener=${openerIdx}`);

  const oct14Leads = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const comp = r[compIdx];
    const phone = r[phoneIdx];
    const date = r[dateIdx];
    const opener = r[openerIdx];
    const notes = r[notesIdx];
    oct14Leads.push({ row: i + 1, company: comp, phone, date, opener, notes });
  }

  console.log('Found leads in New Meetings:', oct14Leads.length);
  oct14Leads.forEach(l => console.log(l));

  // Also check if we can find any call history for these phone numbers in Supabase or Call Logs
  const phones = oct14Leads.map(l => {
    if (!l.phone) return null;
    return String(l.phone).replace(/\D/g, '').slice(-10);
  }).filter(Boolean);

  console.log('\nSearching calls for phones:', phones);
  for (const phone of phones) {
    const { data: calls } = await supabase
      .from('calls')
      .select('call_id, call_date, agent, outcome, duration_sec, to_num')
      .or(`to_num.ilike.%${phone}%,from_num.ilike.%${phone}%`);
    console.log(`Phone ${phone} call records found: ${calls ? calls.length : 0}`);
    if (calls && calls.length > 0) {
      console.log(calls);
    }
  }
}

traceLeads().catch(console.error);
