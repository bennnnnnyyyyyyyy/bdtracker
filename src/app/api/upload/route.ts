import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import * as xlsx from 'xlsx';
import { CONFIG } from '@/lib/config';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Inspect file sheets to determine type
    let fileType: 'ultatel' | 'attendance' | 'unknown' = 'unknown';
    let targetFileName = file.name;

    try {
      const wb = xlsx.read(buffer, { type: 'buffer' });
      const sheetNames = wb.SheetNames.map(s => s.toLowerCase());

      if (sheetNames.includes('attendance') || sheetNames.includes('workforce')) {
        fileType = 'attendance';
        targetFileName = CONFIG.LOCAL_ATTENDANCE_FILE;
      } else {
        // Check if Sheet1 has Ultatel columns (agent, out answered, etc.)
        const s1 = wb.Sheets[wb.SheetNames[0]];
        const rows = xlsx.utils.sheet_to_json(s1, { header: 1 }) as unknown[][];
        const isUltatel = rows.some(r =>
          r && r.some(c => String(c || '').toLowerCase().includes('out answered') || String(c || '').toLowerCase().includes('total calls'))
        );
        if (isUltatel) {
          fileType = 'ultatel';
          targetFileName = CONFIG.LOCAL_ULTATEL_DEPT_FILE;
        }
      }
    } catch (parseErr) {
      return NextResponse.json({ error: 'Uploaded file is not a valid Excel document' }, { status: 400 });
    }

    if (fileType === 'unknown') {
      return NextResponse.json(
        { error: 'Unrecognized Excel format. Please upload either the Ultatel OutBound Calls report or BD French Dashboard Attendance workbook.' },
        { status: 400 }
      );
    }

    // Save to workspace root
    const savePath = path.join(process.cwd(), targetFileName);
    fs.writeFileSync(savePath, buffer);

    console.log(`[File Upload] Successfully updated ${targetFileName} (${fileType}, ${buffer.length} bytes)`);

    return NextResponse.json({
      success: true,
      fileType,
      fileName: targetFileName,
      message: `Successfully processed ${fileType === 'attendance' ? 'Attendance Workbook' : 'Ultatel Department Calls'} (${targetFileName}).`,
    });
  } catch (error: unknown) {
    console.error('API Error in /api/upload:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process uploaded file' },
      { status: 500 }
    );
  }
}
