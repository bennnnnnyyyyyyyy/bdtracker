import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import path from 'path';
import * as xlsx from 'xlsx';
import { CONFIG } from '@/lib/config';
import { invalidateDashboardCache } from '@/lib/sheets';
import { requireUser } from '@/lib/api-auth';
import { looksLikeCallExport, parseCallExportFile, parseCsv } from '@/lib/ultatelFile';
import { dateFromFileName, looksLikeDailyTotals, parseDailyTotalsRows, readTable, spreadOverDays, workingDaysBetween } from '@/lib/dailyTotals';
import { isImportConfigured, missingImportSettings, sendDailyToSheet, sendRowsToSheet, startReplace } from '@/lib/importWebhook';

export const runtime = 'nodejs';
export const maxDuration = 60;
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const guard = await requireUser(request, ['admin', 'manager'], { form: true });
  if (guard.response) return guard.response;

  // Ultatel "Call Details" exports (CSV or Excel) go straight into the Call Logs sheet through its Apps Script
  // web app: the same rules as the Import Staging menu, no pasting. Other workbooks (attendance, department
  // report) are local-only files below.
  try {
    const peek = await request.clone().formData();
    const upload = peek.get('file');
    if (upload instanceof File && (/\.csv$/i.test(upload.name) || /\.xlsx?$/i.test(upload.name))) {
      if (upload.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: 'The file must be 15 MB or smaller.' }, { status: 413 });
      const buf = Buffer.from(await upload.arrayBuffer());

      // Ultatel "Total Calls Per Extension" report: one row per extension for one day.
      let table: unknown[][] = [];
      try { table = readTable(buf, upload.name); } catch { table = []; }
      if (looksLikeDailyTotals(table)) {
        if (!isImportConfigured()) {
          return NextResponse.json({ error: `Uploading reports is not set up yet: the server does not see ${missingImportSettings().join(' and ')}.` }, { status: 501 });
        }
        const typed = String(peek.get('date') ?? '').trim();
        const typedEnd = String(peek.get('endDate') ?? '').trim();
        const iso = /^\d{4}-\d{2}-\d{2}$/;
        const from = iso.test(typed) ? typed : dateFromFileName(upload.name);
        if (!from) {
          return NextResponse.json({ error: 'Which day is this report for? The file name has no date: choose the date and upload again.', needsDate: true }, { status: 400 });
        }
        const to = iso.test(typedEnd) && typedEnd > from ? typedEnd : from;
        const today = new Date().toISOString().slice(0, 10);
        if (from > today || to > today) {
          return NextResponse.json({ error: `The report date ${to > today ? to : from} is in the future.` }, { status: 400 });
        }
        const parsed = parseDailyTotalsRows(table);
        if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });

        const isPeriod = to !== from;
        const dates = isPeriod ? workingDaysBetween(from, to) : [from];
        if (dates.length === 0) return NextResponse.json({ error: 'That period has no working days (Monday to Friday).' }, { status: 400 });
        const days = isPeriod ? spreadOverDays(parsed.rows, dates) : [{ date: from, rows: parsed.rows }];
        const source = isPeriod ? `period ${from}..${to} spread over ${dates.length} working days` : 'daily';
        const result = await sendDailyToSheet(days, source);
        invalidateDashboardCache();
        const total = parsed.rows.reduce((sum, r) => sum + r.totalCalls, 0);
        return NextResponse.json({
          success: true,
          fileType: 'daily_totals',
          date: from,
          message: isPeriod
            ? `Report saved for ${from} to ${to}: ${total} calls spread evenly over ${dates.length} working days (daily numbers inside the period are approximate; weekly and monthly totals are exact).`
            : `Daily totals for ${from} saved: ${parsed.rows.length} extension(s), ${total} calls${result.replaced > 0 ? ' (replaced the earlier upload of that day)' : ''}.`,
          newAgents: result.newAgents,
        });
      }

      if (looksLikeCallExport(buf, upload.name)) {
        if (!isImportConfigured()) {
          return NextResponse.json({ error: `Uploading call exports is not set up yet: the server does not see ${missingImportSettings().join(' and ')}. Settings only take effect after a redeploy (Vercel) or a restart (local), and must be added to the Production environment.` }, { status: 501 });
        }
        const parsed = parseCallExportFile(buf, upload.name);
        // Replace mode: the sheet cleans its tabs in the background (see FileImportModal).
        const phase = String(peek.get('phase') ?? 'import');
        if (phase === 'start') {
          const backupId = String(peek.get('backupId') ?? '').replace(/[^0-9A-Za-z-]/g, '').slice(0, 20) || 'manual';
          const job = await startReplace(parsed.rows, backupId);
          return NextResponse.json({ success: true, fileType: 'ultatel_calls', phase, job });
        }
        const result = await sendRowsToSheet(parsed.rows, fetch, {
          clock: peek.get('clock') === 'ultatel' ? 'ultatel' : 'local',
          skipCheck: peek.get('skipCheck') === '1',
          startChunk: Math.max(0, Number(peek.get('startChunk')) || 0),
          budgetMs: 35_000, // a big file is imported in several requests (each under the 60 s limit)
        });
        invalidateDashboardCache();
        if (result.nextChunk !== null) {
          return NextResponse.json({ success: true, fileType: 'ultatel_calls', ...result, message: `Importing… ${result.nextChunk} of ${result.chunks} parts done.` });
        }
        const parts = [`${result.imported} new call(s) added`];
        if (result.duplicates > 0) parts.push(`${result.duplicates} already in the sheet`);
        return NextResponse.json({
          success: true,
          fileType: 'ultatel_calls',
          ...result,
          message: `Call export imported: ${parts.join(', ')}.`,
        });
      }
      if (/\.csv$/i.test(upload.name)) {
        // A CSV that is not a Call Details export may be the Ultatel per-department summary: store it as the
        // local workbook the app reads. Anything else is rejected with the reason.
        const table = parseCsv(buf.toString('utf8'));
        const isDeptSummary = table.some((row) => row.some((cell) => /out answered|total calls/i.test(cell)));
        if (!isDeptSummary) {
          const why = parseCallExportFile(buf, upload.name).error;
          return NextResponse.json({ error: why || 'Unrecognized CSV. Upload an Ultatel Call Details export or the Ultatel per-department summary.' }, { status: 400 });
        }
        if (process.env.VERCEL) {
          return NextResponse.json({ error: 'The department summary can only be imported in the local dashboard; call exports (Call Details) work everywhere.' }, { status: 501 });
        }
        const wb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(table), 'Sheet1');
        await writeFile(path.join(process.cwd(), CONFIG.LOCAL_ULTATEL_DEPT_FILE), xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }));
        invalidateDashboardCache();
        return NextResponse.json({ success: true, fileType: 'ultatel', fileName: CONFIG.LOCAL_ULTATEL_DEPT_FILE, message: 'Updated Ultatel calls report from the CSV.' });
      }
    }
  } catch (error) {
    console.error('Call export import failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Call export import failed' }, { status: 500 });
  }

  if (process.env.VERCEL) {
    return NextResponse.json({ error: 'Spreadsheet upload is available only in the local dashboard until durable storage and manager authentication are configured.' }, { status: 501 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    if (!/\.xlsx?$/i.test(file.name)) return NextResponse.json({ error: 'Please upload an Excel workbook (.xlsx or .xls).' }, { status: 400 });
    if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: 'The workbook must be 15 MB or smaller.' }, { status: 413 });

    const buffer = Buffer.from(await file.arrayBuffer());
    let fileType: 'ultatel' | 'attendance' | 'unknown' = 'unknown';
    let targetFileName = file.name;

    try {
      const workbook = xlsx.read(buffer, { type: 'buffer' });
      const sheetNames = workbook.SheetNames.map((sheet) => sheet.toLowerCase());
      if (sheetNames.includes('attendance') || sheetNames.includes('workforce')) {
        fileType = 'attendance';
        targetFileName = CONFIG.LOCAL_ATTENDANCE_FILE;
      } else {
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = xlsx.utils.sheet_to_json(firstSheet, { header: 1 }) as unknown[][];
        const isUltatel = rows.some((row) => row?.some((cell) => /out answered|total calls/i.test(String(cell ?? ''))));
        if (isUltatel) {
          fileType = 'ultatel';
          targetFileName = CONFIG.LOCAL_ULTATEL_DEPT_FILE;
        }
      }
    } catch {
      return NextResponse.json({ error: 'Uploaded file is not a valid Excel document' }, { status: 400 });
    }

    if (fileType === 'unknown') return NextResponse.json({ error: 'Unrecognized Excel format. Upload an Ultatel outbound or BD French attendance workbook.' }, { status: 400 });

    await writeFile(path.join(process.cwd(), targetFileName), buffer);
    invalidateDashboardCache();
    return NextResponse.json({ success: true, fileType, fileName: targetFileName, message: `Updated ${fileType === 'attendance' ? 'attendance workbook' : 'Ultatel calls report'}.` });
  } catch (error: unknown) {
    console.error('API Error in /api/upload:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to process uploaded file' }, { status: 500 });
  }
}
