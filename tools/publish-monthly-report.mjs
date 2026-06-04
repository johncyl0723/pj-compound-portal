import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function usage() {
  console.error('Usage: node tools/publish-monthly-report.mjs <report-id> <html-path> [label]');
  process.exit(1);
}

const reportId = process.argv[2];
const htmlArg = process.argv[3];
const labelArg = process.argv[4];

if (!reportId || !htmlArg) usage();
if (!/^\d{6}$/.test(reportId)) {
  throw new Error(`Invalid report id: ${reportId}. Expected YYYYMM.`);
}

const sourcePath = path.resolve(htmlArg);
const projectId = 'pnj-compound-company-limited';
const bucket = 'pnj-compound-company-limited.firebasestorage.app';
const storagePath = `monthlyReports/${reportId}/monthly-report.html`;
const year = reportId.slice(0, 4);
const month = reportId.slice(4, 6);
const label = labelArg || `${year} 年 ${month} 月`;

async function firebaseAccessToken() {
  const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
  const token = config?.tokens?.access_token;
  if (!token) throw new Error('Firebase CLI access token not found. Please login first.');
  return token;
}

async function checkedFetch(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${options.method || 'GET'} ${url} failed: ${response.status} ${body}`);
  }
  return response;
}

const token = await firebaseAccessToken();
const content = await fs.readFile(sourcePath);

await checkedFetch(
  `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(storagePath)}`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'text/html',
    },
    body: content,
  },
);

const now = new Date().toISOString();
const firestoreDoc = {
  fields: {
    year: {stringValue: year},
    month: {stringValue: month},
    label: {stringValue: label},
    storagePath: {stringValue: storagePath},
    originalFileName: {stringValue: path.basename(sourcePath)},
    contentType: {stringValue: 'text/html'},
    active: {booleanValue: true},
    createdAt: {timestampValue: now},
    updatedAt: {timestampValue: now},
  },
};

await checkedFetch(
  `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/portalMonthlyReports/${reportId}`,
  {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(firestoreDoc),
  },
);

console.log(`Published ${reportId} -> ${storagePath}`);
