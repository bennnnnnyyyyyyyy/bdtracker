const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function fetchAllOctoberCalls() {
  console.log('Fetching all October calls from Supabase...');
  
  let allCalls = [];
  let page = 0;
  const pageSize = 1000;
  
  while (true) {
    const { data, error } = await supabase
      .from('calls')
      .select('call_id, call_date, agent, opener, outcome, duration_sec, to_num, from_num, call_type, department')
      .ilike('call_date', '10-%-2026%')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('Error fetching page:', error);
      break;
    }
    if (!data || data.length === 0) break;
    allCalls.push(...data);
    page++;
    if (data.length < pageSize) break;
  }

  console.log(`Total October calls fetched: ${allCalls.length}`);

  // Also check if any call_date is in '2026-10%' format
  let page2 = 0;
  while (true) {
    const { data, error } = await supabase
      .from('calls')
      .select('call_id, call_date, agent, opener, outcome, duration_sec, to_num, from_num, call_type, department')
      .ilike('call_date', '2026-10%')
      .range(page2 * pageSize, (page2 + 1) * pageSize - 1);
    if (error || !data || data.length === 0) break;
    allCalls.push(...data);
    page2++;
    if (data.length < pageSize) break;
  }

  console.log(`Total after checking both patterns: ${allCalls.length}`);

  // Deduplicate by call_id just in case
  const callMap = new Map();
  allCalls.forEach(c => callMap.set(c.call_id, c));
  const uniqueCalls = Array.from(callMap.values());
  console.log(`Unique calls: ${uniqueCalls.length}`);

  // Group by day (YYYY-MM-DD)
  const byDay = {};
  const byDayAgent = {};
  const byDayHour = {};

  uniqueCalls.forEach(c => {
    let d = (c.call_date || '').trim();
    let m = d.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})/);
    let m2 = d.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2}):(\d{2})/);
    let day = null;
    let hour = null;
    if (m) {
      day = `${m[3]}-${m[1]}-${m[2]}`;
      hour = parseInt(m[4], 10);
    } else if (m2) {
      day = `${m2[1]}-${m2[2]}-${m2[3]}`;
      hour = parseInt(m2[4], 10);
    } else {
      day = d.slice(0, 10);
    }

    byDay[day] = (byDay[day] || 0) + 1;

    const agent = c.agent || 'Unknown';
    if (!byDayAgent[day]) byDayAgent[day] = {};
    byDayAgent[day][agent] = (byDayAgent[day][agent] || 0) + 1;

    if (hour !== null) {
      if (!byDayHour[day]) byDayHour[day] = {};
      byDayHour[day][hour] = (byDayHour[day][hour] || 0) + 1;
    }
  });

  const sortedDays = Object.keys(byDay).sort();
  console.log('\nCalls by day in Supabase:');
  sortedDays.forEach(day => {
    console.log(`  ${day}: ${byDay[day]} calls`);
  });

  // Now check meetings in Supabase
  let allMeetings = [];
  let mPage = 0;
  while (true) {
    const { data, error } = await supabase
      .from('meetings')
      .select('*')
      .range(mPage * pageSize, (mPage + 1) * pageSize - 1);
    if (error || !data || data.length === 0) break;
    allMeetings.push(...data);
    mPage++;
    if (data.length < pageSize) break;
  }
  console.log(`\nTotal meetings in Supabase: ${allMeetings.length}`);

  const mtgByDay = {};
  allMeetings.forEach(m => {
    if (m.date_added && m.date_added.startsWith('2026-10')) {
      mtgByDay[m.date_added] = (mtgByDay[m.date_added] || 0) + 1;
    }
  });
  console.log('\nMeetings by day in Supabase:');
  Object.keys(mtgByDay).sort().forEach(day => {
    console.log(`  ${day}: ${mtgByDay[day]} meetings`);
  });

  // Check what meetings are in Oct 14, 15, 16
  const oct14_16Meetings = allMeetings.filter(m => m.date_added && ['2026-10-14', '2026-10-15', '2026-10-16'].includes(m.date_added));
  console.log(`\nOct 14-16 meetings count: ${oct14_16Meetings.length}`);
  console.log(oct14_16Meetings);

  // Return data for further processing
  return { calls: uniqueCalls, meetings: allMeetings, byDay, byDayHour, byDayAgent };
}

fetchAllOctoberCalls().catch(console.error);
