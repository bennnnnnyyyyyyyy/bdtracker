const xlsx = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '..', 'data', 'BD MEETINGS 2026 (10).xlsx');
const wb = xlsx.readFile(filePath);

console.log('Sheets in BD MEETINGS 2026 (10).xlsx:', wb.SheetNames);

wb.SheetNames.forEach(sheetName => {
  const sheet = wb.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  console.log(`Sheet "${sheetName}": ${rows.length} rows`);
  if (rows.length > 0) {
    console.log(`  Header:`, rows[0]);
    if (rows.length > 1) console.log(`  Sample row:`, rows[1]);
  }
});
