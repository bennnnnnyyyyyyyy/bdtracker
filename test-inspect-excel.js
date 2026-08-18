const xlsx = require('xlsx');
const fs = require('fs');

function inspectExcel() {
  console.log('Inspecting local Excel files...');
  if (fs.existsSync('BD MEETINGS 2026 (7).xlsx')) {
    const wb = xlsx.readFile('BD MEETINGS 2026 (7).xlsx');
    console.log('BD MEETINGS sheets:', wb.SheetNames);
    const firstSheet = wb.Sheets[wb.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(firstSheet, { header: 1 });
    console.log('Sample rows from', wb.SheetNames[0], ':', data.slice(0, 4));
  }

  if (fs.existsSync('Call Details 7-18-2026 12_00_00 AM - 8-16-2026 11_59_59 PM.xlsx')) {
    const wb = xlsx.readFile('Call Details 7-18-2026 12_00_00 AM - 8-16-2026 11_59_59 PM.xlsx');
    console.log('Call Details sheets:', wb.SheetNames);
    const firstSheet = wb.Sheets[wb.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(firstSheet, { header: 1 });
    console.log('Sample rows from Call Details:', data.slice(0, 3));
  }
}

inspectExcel();
