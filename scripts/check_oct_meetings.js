const xlsx = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '..', 'data', 'BD MEETINGS 2026 (10).xlsx');
const wb = xlsx.readFile(filePath);

function excelDateToISO(serial) {
  if (!serial || typeof serial !== 'number') return serial;
  const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
  return d.toISOString();
}

const newMeetingsSheet = wb.Sheets['New Meetings'];
if (newMeetingsSheet) {
  const rows = xlsx.utils.sheet_to_json(newMeetingsSheet, { header: 1 });
  console.log('New Meetings rows:', rows.length);
  console.log('Header:', rows[0]);
  
  // Find Date Added column
  const headers = rows[0].map(h => String(h || '').trim().toLowerCase());
  const dateIdx = headers.indexOf('date added');
  const companyIdx = headers.indexOf('company name');
  const openerIdx = headers.indexOf('opener');
  const phoneIdx = headers.indexOf('phone');
  const lastCallIdx = headers.indexOf('last call');
  
  console.log(`Indices: date=${dateIdx}, company=${companyIdx}, opener=${openerIdx}, phone=${phoneIdx}, lastCall=${lastCallIdx}`);

  // Look for rows where Date Added is in October 2026 (approx serial 46296 - 46315)
  // Let's print all October meetings
  const octMeetings = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const dateVal = r[dateIdx];
    const iso = excelDateToISO(dateVal);
    if (iso && String(iso).startsWith('2026-10')) {
      octMeetings.push({
        row: i + 1,
        dateAddedSerial: dateVal,
        dateAddedISO: iso,
        opener: r[openerIdx],
        company: r[companyIdx],
        phone: r[phoneIdx],
        lastCallSerial: r[lastCallIdx],
        lastCallISO: excelDateToISO(r[lastCallIdx])
      });
    }
  }
  console.log(`Found ${octMeetings.length} meetings in New Meetings for Oct 2026:`);
  console.log(JSON.stringify(octMeetings, null, 2));
}

// Check _Activity_Log for October
const logSheet = wb.Sheets['_Activity_Log'];
if (logSheet) {
  const rows = xlsx.utils.sheet_to_json(logSheet, { header: 1 });
  console.log('\n_Activity_Log rows:', rows.length);
  const octLogs = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const iso = excelDateToISO(r[0]);
    if (iso && String(iso).startsWith('2026-10')) {
      octLogs.push({
        timestamp: iso,
        user: r[1],
        action: r[2],
        details: r[3]
      });
    }
  }
  console.log(`Found ${octLogs.length} logs in Oct 2026:`);
  console.log(JSON.stringify(octLogs.slice(-20), null, 2));
}
