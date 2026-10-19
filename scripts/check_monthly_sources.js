const xlsx = require('xlsx');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
  console.log('--- Inspecting BD TRACKER (1).xlsx Daily Totals & Call Logs ---');
  const wb = xlsx.readFile('BD TRACKER (1).xlsx');
  
  if (wb.Sheets['Daily Totals']) {
    const dtRows = xlsx.utils.sheet_to_json(wb.Sheets['Daily Totals'], { header: 1 });
    console.log('Daily Totals rows in BD TRACKER (1):', dtRows.length);
    console.log('Daily Totals sample:', dtRows.slice(0, 5));
  }

  // Check meetings in Supabase by month
  console.log('\n--- Inspecting Meetings in Supabase ---');
  let allMeetings = [];
  let page = 0;
  while (true) {
    const { data, error } = await supabase.from('meetings').select('*').range(page * 1000, (page + 1) * 1000 - 1);
    if (error || !data || data.length === 0) break;
    allMeetings.push(...data);
    page++;
    if (data.length < 1000) break;
  }
  console.log(`Total meetings in Supabase: ${allMeetings.length}`);
  const meetingsByMonth = {};
  allMeetings.forEach(m => {
    if (m.date_added) {
      const ym = m.date_added.slice(0, 7);
      meetingsByMonth[ym] = (meetingsByMonth[ym] || 0) + 1;
    }
  });
  console.log('Meetings by month in Supabase:', meetingsByMonth);

  // Check data/BD MEETINGS 2026 (10).xlsx
  if (fs.existsSync('data/BD MEETINGS 2026 (10).xlsx')) {
    const wbM = xlsx.readFile('data/BD MEETINGS 2026 (10).xlsx', { sheetRows: 5 });
    console.log('\nSheets in data/BD MEETINGS 2026 (10).xlsx:', wbM.SheetNames);
  }
}

inspect().catch(console.error);
