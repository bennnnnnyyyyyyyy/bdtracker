# Agent Instructions for `bd tracker`

This repository is the BD Tracker dashboard: a Next.js application backed by Google Sheets, Supabase, Firebase, and local Excel imports. Keep changes focused and preserve existing user data.

## Operating rules

- Use PowerShell only. Do not use `cmd`, `cmd /c`, or Unix shell commands.
- This PC has no useful system PATH and no administrator access. Use absolute executable paths.
- Prefer small, surgical edits. Do not refactor unrelated code or overwrite changes from another agent/chat.
- Before changing behavior, inspect the current implementation and `git status`.
- Never run destructive SQL or filesystem commands (`DROP`, `TRUNCATE`, broad `DELETE`, recursive deletion) without explicit user approval.
- Do not commit, push, pull, or change remote state unless the user explicitly asks.
- Do not run automated browser testing. After UI changes, provide the local URL and ask the user to test in their browser.

## Repository layout

- `src/app/`: Next.js pages and API routes.
- `src/components/`: dashboard UI, tables, charts, header, and file import modal.
- `src/lib/`: Sheets/Excel ingestion, analytics, attendance, Supabase/Firebase integrations, and XLSX export.
- `src/types/`: shared dashboard and analytics types.
- `apps-script/`: Google Apps Script source and manifest.
- `data/`: local data files and imports. Treat spreadsheets as user data.
- There is no `documentation/operations/WORKLOG.md` in this repository; do not invent that structure unless the user requests it.

## Current feature context

- The sheet includes `MEDB` and `PPO` checkbox columns before the opener/status fields.
- `src/lib/sheets.ts` detects and parses those checkbox columns dynamically.
- `src/lib/analytics.ts` calculates Med B/PPO counts and rates, attendance adherence, and calls-per-day metrics.
- `src/lib/exportXlsx.ts` and the dashboard UI provide per-person XLSX analytics export.
- Attendance and calls-per-day integration includes the import flow in `FileImportModal.tsx` and the related dashboard tables/cards.

## Verification

Use the project’s pinned Node executable:

```powershell
& "C:\Users\ben.arthur\node-v24.14.1-win-x64\node.exe" `
  "C:\Users\ben.arthur\node-v24.14.1-win-x64\node_modules\typescript\bin\tsc" `
  --noEmit
```

Use the same Node installation for project scripts when needed. Check `package.json` before choosing a command. For UI work, verify with type checking/build where practical, then ask the user to test in the browser.

## Syncing Apps Script

The Apps Script project lives in `apps-script/`. If clasp is needed, use the absolute installation path and include `--no-localhost` for login:

```powershell
& "C:\Users\ben.arthur\node-v24.14.1-win-x64\node.exe" `
  "C:\Users\ben.arthur\node-v24.14.1-win-x64\node_modules\@google\clasp\build\src\index.js" `
  [command] --no-localhost
```

Pull only when explicitly requested, review the resulting diff, and never overwrite unrelated local edits.
