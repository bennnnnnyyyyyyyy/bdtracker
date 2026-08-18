import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  const dataDir = path.join(process.cwd(), 'data');
  const exists = fs.existsSync(dataDir);
  const files = exists ? fs.readdirSync(dataDir) : [];
  return NextResponse.json({
    cwd: process.cwd(),
    dataDirExists: exists,
    files,
  });
}
