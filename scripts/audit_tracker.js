const xlsx = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '..', 'BD TRACKER.xlsx');
console.log('Loading workbook:', filePath);
const wb = xlsx.readFile(filePath);

console.log('Sheets in workbook:', wb.SheetNames);

const sheetName = 'Call Logs';
const sheet = wb.Sheets[sheetName];
if (!sheet) {
  console.error('Sheet "Call Logs" not found!');
  process.exit(1);
}

const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false });
const rawRows = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: true });

console.log('Total rows including header:', rows.length);
const headers = rows[0];
console.log('Headers:', headers);

const idCounts = new Map();
const idToRows = new Map();
const compoundCounts = new Map();
const compoundToRows = new Map();

const dateTypeCounts = {};
const datePatternCounts = {};

for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  const rawRow = rawRows[i];

  const dateVal = rawRow ? rawRow[0] : undefined;
  const dateStr = row ? String(row[0] || '').trim() : '';
  const dateType = typeof dateVal;
  dateTypeCounts[dateType] = (dateTypeCounts[dateType] || 0) + 1;

  // Classify date string pattern
  let pattern = 'other';
  if (/^\d{2}-\d{2}-\d{4}\s+\d{1,2}:\d{2}:\d{2}$/.test(dateStr)) {
    pattern = 'MM-DD-YYYY HH:mm:ss';
  } else if (/^\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}:\d{2}$/.test(dateStr)) {
    pattern = 'YYYY-MM-DD HH:mm:ss';
  } else if (/^\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}/.test(dateStr)) {
    pattern = 'M/D/YYYY H:mm';
  } else if (dateStr === '') {
    pattern = 'empty';
  }
  datePatternCounts[pattern] = (datePatternCounts[pattern] || 0) + 1;

  // Call ID analysis
  const callId = row && row[1] !== undefined ? String(row[1]).trim().toLowerCase() : '';
  if (callId) {
    idCounts.set(callId, (idCounts.get(callId) || 0) + 1);
    if (!idToRows.has(callId)) idToRows.set(callId, []);
    idToRows.get(callId).push(i + 1);
  }

  // Compound key analysis: Date|From|To|Duration|Extension
  const fromNum = row ? String(row[2] || '').trim() : '';
  const toNum = row ? String(row[3] || '').trim() : '';
  const ext = row ? String(row[4] || '').trim() : '';
  const dur = row ? String(row[10] || '').trim() : '';
  const compound = `${dateStr}|${fromNum}|${toNum}|${dur}|${ext}`.toLowerCase();

  compoundCounts.set(compound, (compoundCounts.get(compound) || 0) + 1);
  if (!compoundToRows.has(compound)) compoundToRows.set(compound, []);
  compoundToRows.get(compound).push(i + 1);
}

console.log('\n--- Date Type Distribution (Raw cell types) ---');
console.table(dateTypeCounts);

console.log('\n--- Date Format Patterns (Formatted strings) ---');
console.table(datePatternCounts);

// Duplicate Call IDs
let duplicateIdCount = 0;
const duplicateIdExamples = [];
for (const [id, count] of idCounts.entries()) {
  if (count > 1) {
    duplicateIdCount += (count - 1);
    if (duplicateIdExamples.length < 5) {
      duplicateIdExamples.push({ id, count, rows: idToRows.get(id) });
    }
  }
}

console.log('\n--- Duplicate Call IDs ---');
console.log('Total unique Call IDs with duplicates:', [...idCounts.values()].filter(c => c > 1).length);
console.log('Total duplicate row instances:', duplicateIdCount);
console.log('Sample duplicates by Call ID:');
console.dir(duplicateIdExamples, { depth: null });

// Duplicate Compound Keys
let duplicateCompoundCount = 0;
const duplicateCompoundExamples = [];
for (const [key, count] of compoundCounts.entries()) {
  if (count > 1) {
    duplicateCompoundCount += (count - 1);
    if (duplicateCompoundExamples.length < 5) {
      duplicateCompoundExamples.push({ key, count, rows: compoundToRows.get(key) });
    }
  }
}

console.log('\n--- Duplicate Compound Keys (Date|From|To|Duration|Extension) ---');
console.log('Total unique Compound Keys with duplicates:', [...compoundCounts.values()].filter(c => c > 1).length);
console.log('Total duplicate row instances:', duplicateCompoundCount);
console.log('Sample duplicates by Compound Key:');
console.dir(duplicateCompoundExamples, { depth: null });

// Check Attendance and BD Dashboard tabs
for (const name of ['Attendance', 'Agent Mapping', 'BD Dashboard']) {
  const s = wb.Sheets[name];
  if (s) {
    const sRows = xlsx.utils.sheet_to_json(s, { header: 1 });
    console.log(`\nSheet "${name}": ${sRows.length} rows`);
    if (sRows.length > 0) {
      console.log('  Header:', sRows[0]);
      if (sRows.length > 1) console.log('  Row 1:', sRows[1]);
    }
  }
}
