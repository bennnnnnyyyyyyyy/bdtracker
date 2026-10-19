const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase credentials missing!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('Connected to Supabase. Checking tables...');
  
  // Check calls count
  const { count: callsCount, error: callsErr } = await supabase.from('calls').select('*', { count: 'exact', head: true });
  console.log('Total calls:', callsCount, 'error:', callsErr);

  // Check meetings count
  const { count: meetingsCount, error: mtgErr } = await supabase.from('meetings').select('*', { count: 'exact', head: true });
  console.log('Total meetings:', meetingsCount, 'error:', mtgErr);

  // Get sample calls
  const { data: sampleCalls } = await supabase.from('calls').select('*').limit(5);
  console.log('Sample call:', sampleCalls ? sampleCalls[0] : null);

  // Get sample meetings
  const { data: sampleMeetings } = await supabase.from('meetings').select('*').limit(5);
  console.log('Sample meeting:', sampleMeetings ? sampleMeetings[0] : null);
}

main().catch(console.error);
