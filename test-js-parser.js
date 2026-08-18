const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const CONFIG = {
  BD_TABS: [
    'New Meetings', 'Follow Ups', 'Contract Sent', 'Invoice Sent',
    'Onboarded', 'No-Show', 'Dead Leads', 'Temporary Inactive'
  ]
};

function parseAgentName(extensionCell) {
  if (!extensionCell) return '';
  const m = extensionCell.match(/\(MMS-([^)]+)\)/);
  return m ? m[1].trim() : extensionCell.trim();
}

function durationToSeconds(val) {
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

function loadLocalActualData() {
  const trackerCounts = {};
  const calls = [];
  let agentMappings = [
    { agent: 'Kaity James', opener: 'Jane' },
    { agent: 'Ben Arthur', opener: 'Ben' },
    { agent: 'Jasmine Green', opener: 'Jasmine' },
    { agent: 'Selene Myles', opener: 'Selene' },
    { agent: 'Jimmy Pearson', opener: 'Jimmy' },
    { agent: 'Nora Atkins', opener: 'Nora' }
  ];

  const bdFiles = ['BD MEETINGS 2026 (7).xlsx', 'BD TRACKER (1).xlsx'];
  for (const f of bdFiles) {
    const p = path.join(process.cwd(), f);
    if (fs.existsSync(p)) {
      try {
        const wb = xlsx.readFile(p);
        CONFIG.BD_TABS.forEach(tabName => {
          if (wb.Sheets[tabName]) {
            const rows = xlsx.utils.sheet_to_json(wb.Sheets[tabName], { header: 1 });
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
      } catch (err) {
        console.warn('Error reading BD meetings Excel:', err);
      }
    }
  }

  const callFiles = fs.readdirSync(process.cwd()).filter(f => f.startsWith('Call Details') && f.endsWith('.xlsx'));
  if (callFiles.length > 0) {
    const callFilePath = path.join(process.cwd(), callFiles[0]);
    try {
      const wb = xlsx.readFile(callFilePath);
      const firstSheet = wb.Sheets[wb.SheetNames[0]];
      const rows = xlsx.utils.sheet_to_json(firstSheet, { header: 1 });
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || (!r[0] && !r[1])) continue;

        const ext = String(r[4] || '');
        const parsedAgent = parseAgentName(ext);
        const durVal = r[10];
        const durSec = durationToSeconds(durVal);

        calls.push({
          callDate: String(r[0] || ''),
          callId: String(r[1] || `CALL-${i}`),
          from: String(r[2] || ''),
          to: String(r[3] || ''),
          extension: ext,
          department: String(r[5] || ''),
          did: String(r[6] || ''),
          description: String(r[7] || ''),
          type: String(r[8] || 'OUT-Bound'),
          outcome: String(r[9] || 'ANSWERED'),
          duration: String(durVal || '0:00'),
          durationSec: durSec,
          notes: String(r[11] || ''),
          callPath: String(r[12] || ''),
          agent: parsedAgent,
          opener: ''
        });
      }
    } catch (err) {
      console.warn('Error reading call logs:', err);
    }
  }

  return { calls, trackerCounts, agentMappings };
}

const data = loadLocalActualData();
console.log('Loaded calls:', data.calls.length);
console.log('Loaded tracker counts:', data.trackerCounts);
