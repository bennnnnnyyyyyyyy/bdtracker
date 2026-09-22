import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import path from 'path';
import * as xlsx from 'xlsx';
import { CONFIG } from '@/lib/config';

export const runtime = 'nodejs';
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export async function POST(request: NextRequest) {
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
    return NextResponse.json({ success: true, fileType, fileName: targetFileName, message: `Updated ${fileType === 'attendance' ? 'attendance workbook' : 'Ultatel calls report'}.` });
  } catch (error: unknown) {
    console.error('API Error in /api/upload:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to process uploaded file' }, { status: 500 });
  }
}
