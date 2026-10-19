const xlsx = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '..', 'BD TRACKER.xlsx');
console.log('Loading workbook:', filePath);
const wb = xlsx.readFile(filePath);

console.log('Sheet names:', wb.SheetNames);

const sheet = wb.Sheets['Call Logs'];
if (sheet) {
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  console.log('Call Logs row count:', rows.length);
  console.log('Header:', rows[0]);
  console.log('Row 1:', rows[1]);
  console.log('Row 2:', rows[2]);
  console.log('Last row:', rows[rows.length - 1]);

  // Find min and max date in Call Logs
  const dates = {};
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[0]) continue;
    const dStr = String(r[0]).trim();
    // parse date
    let day = null;
    let m = dStr.match(/^(\d{2})-(\d{2})-(\d{4})/);
    let m2 = dStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) day = `${m[3]}-${m[1]}-${m[2]}`;
    else if (m2) day = `${m2[1]}-${m2[2]}-${m2[3]}`;
    else day = dStr.slice(0, 10);
    dates[day] = (dates[day] || 0) + 1;
  }
  const sortedDays = Object.keys(dates).sort();
  console.log('Call Logs min day:', sortedDays[0], 'max day:', sortedDays[sortedDays.length - 1]);
  console.log('Days in October 2026:');
  sortedDays.filter(d => d.startsWith('2026-10')).forEach(d => {
    console.log(`  ${d}: ${dates[d]} calls`);
  });
}
