const xlsx = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '..', 'BD TRACKER.xlsx');
console.log('Auditing workbook:', filePath);
const wb = xlsx.readFile(filePath);

const sheetName = 'Call Logs';
const sheet = wb.Sheets[sheetName];
const rowsRaw = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: true });
const rowsFmt = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false });

console.log('Total rows in Call Logs:', rowsFmt.length);

function cleanPhone(val) {
  if (!val) return '';
  return String(val).replace(/\D+/g, '');
}

function normalizeCallId(val) {
  if (!val) return '';
  const s = String(val).trim().toLowerCase();
  const num = Number(s);
  if (!isNaN(num) && num > 1e8) {
    return String(Math.floor(num));
  }
  return s.split('.')[0];
}

function parseAgentName(val) {
  if (!val) return '';
  const m = String(val).match(/\(MMS-([^)]+)\)/);
  return m ? m[1].trim().toLowerCase() : String(val).trim().toLowerCase();
}

function durationSec(val) {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') {
    if (val < 1 && val > 0) return Math.round(val * 86400);
    return Math.round(val);
  }
  const s = String(val).trim();
  const parts = s.split(':').map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function normalizeDateMinute(val) {
  if (!val) return '';
  let d;
  if (typeof val === 'number') {
    // Excel serial date to JS Date
    d = new Date(Math.round((val - 25569) * 86400 * 1000));
  } else {
    d = new Date(val);
  }
  if (isNaN(d.getTime())) return String(val).trim();
  // Round to minute (ignoring second discrepancies)
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}`;
}

const seenIds = new Set();
const seenCompound = new Set();

let duplicateCount = 0;
const duplicatesByReason = {
  callId: 0,
  compoundKey: 0
};

const uniqueRows = [rowsFmt[0]]; // header

for (let i = 1; i < rowsFmt.length; i++) {
  const row = rowsFmt[i];
  const rawRow = rowsRaw[i];

  const rawId = row[1];
  const normId = normalizeCallId(rawId);

  const rawDate = rawRow ? rawRow[0] : row[0];
  const dateMin = normalizeDateMinute(rawDate);
  const fromNum = cleanPhone(row[2]);
  const toNum = cleanPhone(row[3]);
  const agent = parseAgentName(row[4]);
  const dur = durationSec(row[10]);

  const compound = `${dateMin}|${fromNum}|${toNum}|${dur}|${agent}`;

  let isDup = false;
  if (normId && seenIds.has(normId)) {
    isDup = true;
    duplicatesByReason.callId++;
  } else if (!normId && seenCompound.has(compound)) {
    isDup = true;
    duplicatesByReason.compoundKey++;
  }

  if (isDup) {
    duplicateCount++;
  } else {
    if (normId) seenIds.add(normId);
    seenCompound.add(compound);
    uniqueRows.push(row);
  }
}

console.log('\n--- Deduplication Simulation Results ---');
console.log('Total rows scanned:', rowsFmt.length - 1);
console.log('Unique rows preserved:', uniqueRows.length - 1);
console.log('Duplicate rows identified:', duplicateCount);
console.log('Duplicates by reason:', duplicatesByReason);
