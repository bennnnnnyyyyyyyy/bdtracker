import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import path from 'path';
import * as xlsx from 'xlsx';
import { CONFIG } from '@/lib/config';
import { invalidateDashboardCache } from '@/lib/sheets';
import { requireUser } from '@/lib/api-auth';
import { dateFromFileName, dateRangeFromTable, looksLikeDailyTotals, looksLikeDateDistribution, parseDailyTotalsRows, parseDateDistribution, readTable, spreadOverDays, workingDaysBetween } from '@/lib/dailyTotals';
import { isImportConfigured, missingImportSettings, sendDailyToSheet } from '@/lib/importWebhook';

export const runtime = 'nodejs';
export const maxDuration = 60;
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const guard = await requireUser(request, ['admin', 'manager'], { form: true });
  if (guard.response) return guard.response;

  // Ultatel "Total Calls Per Extension" reports (CSV or Excel) go to the Daily Totals sheet through its Apps Script
  // web app. Other workbooks (attendance, department report) are local-only files below.
  try {
    const peek = await request.clone().formData();
    const upload = peek.get('file');
    if (upload instanceof File && (/\.csv$/i.test(upload.name) || /\.xlsx?$/i.test(upload.name))) {
      if (upload.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: 'The file must be 15 MB or smaller.' }, { status: 413 });
      const buf = Buffer.from(await upload.arrayBuffer());

      // Ultatel "Total Calls Per Extension" report: one row per extension for one day.
      let table: unknown[][] = [];
      try { table = readTable(buf, upload.name); } catch { table = []; }
      // One extension, one row per day.
      if (looksLikeDateDistribution(table)) {
        if (!isImportConfigured()) {
          return NextResponse.json({ error: `Uploading reports is not set up yet: the server does not see ${missingImportSettings().join(' and ')}.` }, { status: 501 });
        }
        const parsed = parseDateDistribution(table);
        if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
        const today = new Date().toISOString().slice(0, 10);
        const future = parsed.days.find((d) => d.date > today);
        if (future) return NextResponse.json({ error: `The report contains a future date (${future.date}).` }, { status: 400 });
        const result = await sendDailyToSheet(parsed.days.map((d) => ({ date: d.date, rows: [d.row] })), 'daily', fetch, { defer: peek.get('more') === '1' });
        invalidateDashboardCache();
        const total = parsed.days.reduce((sum, d) => sum + d.row.totalCalls, 0);
        const first = parsed.days[0].date;
        const last = parsed.days[parsed.days.length - 1].date;
        return NextResponse.json({
          success: true,
          fileType: 'daily_totals',
          date: first,
          message: `Extension ${parsed.extensionNumber}${result.resolved ? ` (${result.resolved})` : ''}: ${parsed.days.length} day(s) saved (${first} to ${last}), ${total} calls.`,
          newAgents: result.newAgents,
        });
      }

      if (looksLikeDailyTotals(table)) {
        if (!isImportConfigured()) {
          return NextResponse.json({ error: `Uploading reports is not set up yet: the server does not see ${missingImportSettings().join(' and ')}.` }, { status: 501 });
        }
        // Which days: dates typed in the upload window win, then "Date from / Date to" inside the file, then the file name.
        const typed = String(peek.get('date') ?? '').trim();
        const typedEnd = String(peek.get('endDate') ?? '').trim();
        const iso = /^\d{4}-\d{2}-\d{2}$/;
        const inFile = dateRangeFromTable(table);
        let from: string | null = null;
        let to: string | null = null;
        if (iso.test(typed)) {
          from = typed;
          to = iso.test(typedEnd) && typedEnd > typed ? typedEnd : typed;
        } else if (inFile) {
          ({ from, to } = inFile);
        } else {
          from = dateFromFileName(upload.name);
          to = from;
        }
        if (!from || !to) {
          return NextResponse.json({ error: 'Which days is this report for? The file has no "Date from / Date to" and its name has no date: choose the dates in the upload window and upload again.', needsDate: true }, { status: 400 });
        }
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
        const result = await sendDailyToSheet(days, source, fetch, { defer: peek.get('more') === '1' });
        invalidateDashboardCache();
        const total = parsed.rows.reduce((sum, r) => sum + r.totalCalls, 0);
        return NextResponse.json({
          success: true,
          fileType: 'daily_totals',
          date: from,
          message: isPeriod
            ? `Report saved for ${from} to ${to}: ${total} calls spread evenly over ${dates.length} working days (daily numbers inside the period are approximate; weekly and monthly totals are exact).${result.protectedDays > 0 ? ` ${result.protectedDays} extension-day(s) already uploaded as real daily numbers were kept.` : ''}`
            : `Daily totals for ${from} saved: ${parsed.rows.length} extension(s), ${total} calls${result.replaced > 0 ? ' (replaced the earlier upload of that day)' : ''}.`,
          newAgents: result.newAgents,
        });
      }

      if (/\.csv$/i.test(upload.name)) {
        return NextResponse.json({ error: 'This CSV is not an Ultatel "Total Calls Per Extension" report (the Extension and Out/In Answered/Unanswered columns were not found).' }, { status: 400 });
      }
    }
  } catch (error) {
    console.error('Report import failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Report import failed' }, { status: 500 });
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
