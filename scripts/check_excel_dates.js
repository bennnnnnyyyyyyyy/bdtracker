const xlsx = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '..', 'BD TRACKER.xlsx');
console.log('Loading workbook:', filePath);
const wb = xlsx.readFile(filePath);

const sheet = wb.Sheets['Call Logs'];
const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

function parseAnyDate(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') {
    if (val > 30000 && val < 60000) {
      const jsDate = new Date(Math.round((val - 25569) * 86400 * 1000));
      return jsDate.toISOString().slice(0, 10);
    }
  }
  const s = String(val).trim();
  let m1 = s.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (m1) return `${m1[3]}-${m1[1]}-${m1[2]}`;
  let m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
  let m3 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m3) return `${m3[3]}-${String(m3[1]).padStart(2, '0')}-${String(m3[2]).padStart(2, '0')}`;
  return null;
}

const dateCounts = {};
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  if (!r || !r[0]) continue;
  const d = parseAnyDate(r[0]);
  if (d) {
    dateCounts[d] = (dateCounts[d] || 0) + 1;
  }
}

console.log('Dates found in Call Logs:');
Object.keys(dateCounts).sort().filter(d => d.startsWith('2026-10')).forEach(d => {
  console.log(`  ${d}: ${dateCounts[d]} calls`);
});
