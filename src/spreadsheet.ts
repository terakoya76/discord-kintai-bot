import {google} from 'googleapis';
import * as fs from 'fs';

const defaultGoogleServiceAccountCredentialsPath =
  '/etc/discord-kintai-bot/google_service_account_credentials.json';
const auth = new google.auth.GoogleAuth({
  keyFile:
    process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS_PATH ||
    defaultGoogleServiceAccountCredentialsPath,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({version: 'v4', auth});

const defaultOrgToSheetIdConfPath =
  '/etc/discord-kintai-bot/org_to_sheet_id.json';
const orgToSheetIdConfPath =
  process.env.ORG_TO_SHEET_ID_CONF_PATH || defaultOrgToSheetIdConfPath;
const orgToSheetId = JSON.parse(fs.readFileSync(orgToSheetIdConfPath, 'utf8'));

const headers = [
  'date',
  'threadId',
  'startTime',
  'endTime',
  'breakTimeRecords',
  'breakTime',
  'workingTime',
];
const recordRange = 'A2:G';

interface SheetData {
  [date: string]: SheetRow;
}

export type WorkState = 'working' | 'break' | 'completed';

interface SheetRow {
  threadId: string;
  startTime?: Date;
  endTime?: Date;
  breakTimeRecords: BreakTimeRecord[];
  breakTime: number;
  workingTime: number;
  state: WorkState;
}

interface BreakTimeRecord {
  startTime?: Date;
  endTime?: Date;
}

/**
 * Type guard to check if a date is valid (not undefined and not Invalid Date).
 * This handles the case where new Date(undefined) or new Date(null) creates Invalid Date.
 */
function isValidDate(d: Date | undefined): d is Date {
  return d instanceof Date && !isNaN(d.getTime());
}

export function deriveState(row: Omit<SheetRow, 'state'>): WorkState {
  if (isValidDate(row.endTime)) return 'completed';

  const lastRecord = row.breakTimeRecords[row.breakTimeRecords.length - 1];
  if (
    lastRecord &&
    isValidDate(lastRecord.startTime) &&
    !isValidDate(lastRecord.endTime)
  ) {
    return 'break';
  }

  return 'working';
}

export function lookupSheetId(org: string): string {
  return orgToSheetId[org]['sheetId'];
}

export function getTodayStr(dd: Date): string {
  const jstDate = dd.toLocaleDateString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return jstDate;
}

export function getSheetNameFromTodayStr(today: string): string {
  const arr = today.split('/').slice(0, 2);
  const y = arr[0];
  const m = arr[1].toString().padStart(2, '0');
  return `${y}/${m}`;
}

export async function getSheetData(sheetId: string, sheetName: string) {
  const range = `${sheetName}!${recordRange}`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range,
  });

  const data: SheetData = {};

  const rows = res.data.values;
  if (!rows) return data;

  for (const row of rows) {
    const date = row[headers.indexOf('date')];
    const rowData = {
      threadId: row[headers.indexOf('threadId')],
      startTime: row[headers.indexOf('startTime')]
        ? new Date(row[headers.indexOf('startTime')])
        : undefined,
      endTime: row[headers.indexOf('endTime')]
        ? new Date(row[headers.indexOf('endTime')])
        : undefined,
      breakTimeRecords: JSON.parse(
        row[headers.indexOf('breakTimeRecords')],
      ).map((btr: {startTime?: string; endTime?: string}) => ({
        startTime: btr.startTime ? new Date(btr.startTime) : undefined,
        endTime: btr.endTime ? new Date(btr.endTime) : undefined,
      })),
      breakTime: row[headers.indexOf('breakTime')],
      workingTime: row[headers.indexOf('workingTime')],
    };
    data[date] = {...rowData, state: deriveState(rowData)};
  }

  return data;
}

export async function updateSheetData(
  sheetId: string,
  sheetName: string,
  data: SheetData,
) {
  const tmpRows = Object.entries(data);
  const entry = tmpRows.pop();
  if (entry) {
    tmpRows.push([entry[0], calcSheetRow(entry[1])]);
  }

  const rows = tmpRows.map(([date, row]) => [
    date,
    row.threadId,
    row.startTime?.toISOString() ?? '',
    row.endTime?.toISOString() ?? '',
    JSON.stringify(row.breakTimeRecords),
    row.breakTime.toString(),
    row.workingTime.toString(),
  ]);

  const range = `${sheetName}!${recordRange}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: rows,
    },
  });
}

function calcSheetRow(row: SheetRow): SheetRow {
  const breakTime = row['breakTimeRecords'].reduce((acc, curr) => {
    if (!isValidDate(curr.startTime) || !isValidDate(curr.endTime)) return acc;

    const duration =
      Math.abs(curr['endTime'].valueOf() - curr['startTime'].valueOf()) /
      1000 /
      60; // in-minute
    return acc + duration;
  }, 0);

  if (!isValidDate(row.startTime) || !isValidDate(row.endTime)) {
    const result = {...row, breakTime};
    return {...result, state: deriveState(result)};
  }

  const total =
    Math.abs(row['endTime'].valueOf() - row['startTime'].valueOf()) / 1000 / 60; // in-minute
  const workingTime = total - breakTime;

  const result = {...row, breakTime, workingTime};
  return {...result, state: deriveState(result)};
}

export function startWorkRow(threadId: string): SheetRow {
  return {
    threadId: threadId,
    startTime: new Date(),
    endTime: undefined,
    breakTimeRecords: [],
    breakTime: 0,
    workingTime: 0,
    state: 'working',
  };
}

export function suspendWorkRow(row: SheetRow): SheetRow {
  const ret = {...row};

  // Deep clone breakTimeRecords to avoid mutating the original
  const breakRecords = ret.breakTimeRecords.map(record => ({...record}));

  const btr = newBreakTimeRecord();
  btr.startTime = new Date();
  breakRecords.push(btr);

  ret.breakTimeRecords = breakRecords;
  ret.state = 'break';
  return ret;
}

function newBreakTimeRecord(): BreakTimeRecord {
  return {};
}

export function resumeWorkRow(row: SheetRow): SheetRow {
  const ret = {...row};

  // Deep clone breakTimeRecords to avoid mutating the original
  const breakRecords = ret.breakTimeRecords.map(record => ({...record}));

  if (breakRecords.length === 0) return row;

  const lastRecord = breakRecords[breakRecords.length - 1];
  lastRecord.endTime = new Date();

  ret.breakTimeRecords = breakRecords;
  ret.state = 'working';
  return calcSheetRow(ret);
}

export function endWorkRow(row: SheetRow): SheetRow {
  const ret = {...row};
  const now = new Date();

  // Deep clone breakTimeRecords to avoid mutating the original
  const breakRecords = ret.breakTimeRecords.map(record => ({...record}));

  // Process break records:
  // 1. Filter out records with invalid startTime
  // 2. Close open break records (endTime undefined) by setting endTime = now
  // 3. Filter out records with corrupted endTime (Invalid Date objects)
  const processedBreakRecords = breakRecords
    .filter(record => isValidDate(record.startTime))
    .map(record => {
      // If endTime is undefined (open break), close it with session end time
      if (record.endTime === undefined) {
        return {...record, endTime: now};
      }
      return record;
    })
    .filter(record => isValidDate(record.endTime));

  ret.breakTimeRecords = processedBreakRecords;
  ret.endTime = now;
  ret.state = 'completed';
  return calcSheetRow(ret);
}
