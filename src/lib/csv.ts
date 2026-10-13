/** Cell text safe to open in Excel: values that would run as a formula get a leading apostrophe. */
function safeCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  // "=", "@" and "+"/"-" followed by something other than a digit can execute as a formula (CSV injection).
  // Phone numbers such as +16156173189 are plain numbers and stay exactly as they are.
  return /^[=@]/.test(text) || /^[+-](?!\d)/.test(text) ? `'${text}` : text;
}

/** RFC-4180 CSV text for a table, with CRLF line ends. */
export function toCsv(rows: (string | number | boolean | null | undefined)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const text = safeCell(cell);
          return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join(',')
    )
    .join('\r\n');
}

/** Downloads a CSV in the browser. A BOM is added so Excel reads accented names correctly. */
export function downloadCsv(filename: string, rows: (string | number | boolean | null | undefined)[][]): void {
  const blob = new Blob(['﻿', toCsv(rows)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
