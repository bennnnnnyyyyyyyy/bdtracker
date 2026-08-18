const xlsx = require('xlsx');
const wb = xlsx.readFile('BD TRACKER (1).xlsx');
console.log('BD TRACKER (1) Sheets:', wb.SheetNames);
if (wb.Sheets['Agent Mapping']) {
  console.log('Agent Mapping in BD TRACKER (1):', xlsx.utils.sheet_to_json(wb.Sheets['Agent Mapping'], { header: 1 }));
}
