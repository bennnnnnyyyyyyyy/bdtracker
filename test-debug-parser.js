const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

function testLocalParser() {
  const BD_TABS = [
    'New Meetings', 'Follow Ups', 'Contract Sent', 'Invoice Sent',
    'Onboarded', 'No-Show', 'Dead Leads', 'Temporary Inactive'
  ];

  const trackerCounts = {};
  const bdFiles = ['BD MEETINGS 2026 (7).xlsx', 'BD TRACKER (1).xlsx'];
  
  for (const f of bdFiles) {
    const p = path.join(process.cwd(), f);
    console.log('Checking file:', p, 'exists:', fs.existsSync(p));
    if (fs.existsSync(p)) {
      const wb = xlsx.readFile(p);
      console.log('Sheets in file:', wb.SheetNames);
      BD_TABS.forEach(tabName => {
        if (wb.Sheets[tabName]) {
          const rows = xlsx.utils.sheet_to_json(wb.Sheets[tabName], { header: 1 });
          console.log(`Tab: ${tabName}, rows: ${rows.length}`);
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || !row[1]) continue;
            const opener = String(row[1]).trim();
            if (!opener) continue;
            if (!trackerCounts[opener]) trackerCounts[opener] = {};
            trackerCounts[opener][tabName] = (trackerCounts[opener][tabName] || 0) + 1;
          }
        }
      });
      break;
    }
  }

  console.log('Parsed tracker counts:', trackerCounts);

  const callFiles = fs.readdirSync(process.cwd()).filter(f => f.startsWith('Call Details') && f.endsWith('.xlsx'));
  console.log('Found call files:', callFiles);
  if (callFiles.length > 0) {
    const wb = xlsx.readFile(path.join(process.cwd(), callFiles[0]));
    const firstSheet = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(firstSheet, { header: 1 });
    console.log('Call details row count:', rows.length);
    console.log('First 2 rows:', rows.slice(0, 2));
  }
}

testLocalParser();
