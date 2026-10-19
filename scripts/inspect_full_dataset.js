const { createClient } = require('@supabase/supabase-js');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  // Check metadata table
  const { data: meta } = await supabase.from('metadata').select('*');
  console.log('Metadata keys:', meta ? meta.map(m => m.key) : []);
  if (meta) {
    meta.forEach(m => {
      console.log(`Key ${m.key}:`, JSON.stringify(m.value).slice(0, 300));
    });
  }

  // Check all distinct date patterns in calls
  console.log('\n--- Checking calls table dates ---');
  // Sample 50 calls from different parts of the table or order by call_date desc
  const { data: latestCalls } = await supabase.from('calls').select('call_id, call_date, agent, opener, outcome, to_num').order('call_date', { ascending: false }).limit(20);
  console.log('Latest calls in Supabase:', latestCalls);

  // Check what meetings exist in Supabase around Oct 14-16
  const { data: octMtg } = await supabase.from('meetings').select('*').gte('date_added', '2026-10-10').lte('date_added', '2026-10-20');
  console.log('\nMeetings Oct 10-20 in Supabase:', octMtg);

  // Check OutBound Calls Per Department ( BusinessDevelopmentTeam ).xlsx
  const outboundPath = path.join(process.cwd(), 'OutBound Calls Per Department ( BusinessDevelopmentTeam ).xlsx');
  if (fs.existsSync(outboundPath)) {
    const wb = xlsx.readFile(outboundPath);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    console.log('\nOutbound calls file headers:', data[0]);
    console.log('Outbound calls file rows count:', data.length);
    console.log('Outbound calls first 3 rows:', data.slice(1, 4));
    console.log('Outbound calls last 3 rows:', data.slice(-3));
  }

  // Check BD _ French Dashboard 2026 (3).xlsx
  const frenchPath = path.join(process.cwd(), 'BD _ French Dashboard 2026 (3).xlsx');
  if (fs.existsSync(frenchPath)) {
    const wb = xlsx.readFile(frenchPath, { sheetRows: 5 });
    console.log('\nFrench dashboard sheets:', wb.SheetNames);
  }
}

main().catch(console.error);
