const xlsx = require('xlsx');

const wb = xlsx.readFile('BD TRACKER (1).xlsx');

console.log('Checking call tabs in BD TRACKER (1).xlsx:');

const callTabs = [
  'Call Logs 2026-05',
  'Call Logs 2026-06',
  'Call Logs 2026-07',
  'Call Logs 2026-08',
  'Call Logs 2026-09',
  'Call Logs',
  'Daily Totals'
];

callTabs.forEach(t => {
  const sheet = wb.Sheets[t];
  if (!sheet) {
    console.log(`Tab "${t}" not found!`);
    return;
  }
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  console.log(`Tab "${t}": ${rows.length} rows. Header:`, rows[0] ? rows[0].slice(0, 6) : 'empty');
  if (rows.length > 1) {
    console.log(`  Sample row 1:`, rows[1].slice(0, 6));
    console.log(`  Sample last row:`, rows[rows.length - 1].slice(0, 6));
  }
});
