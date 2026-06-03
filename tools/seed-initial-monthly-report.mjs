import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const projectId = 'pnj-compound-company-limited';
const bucket = 'pnj-compound-company-limited.firebasestorage.app';
const reportId = '202604';
const sourcePath = path.resolve('2026_04', '202604_Monthly_Report.html');
const storagePath = `monthlyReports/${reportId}/monthly-report.html`;

async function firebaseAccessToken() {
  const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
  const token = config?.tokens?.access_token;
  if (!token) throw new Error('Firebase CLI access token not found. Run firebase login first.');
  return token;
}

async function checkedFetch(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${options.method || 'GET'} ${url} failed: ${res.status} ${body}`);
  }
  return res;
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
    year: { stringValue: '2026' },
    month: { stringValue: '04' },
    label: { stringValue: '2026 年 04 月' },
    storagePath: { stringValue: storagePath },
    originalFileName: { stringValue: '202604_Monthly_Report.html' },
    contentType: { stringValue: 'text/html' },
    active: { booleanValue: true },
    createdAt: { timestampValue: now },
    updatedAt: { timestampValue: now },
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

console.log(`Seeded ${reportId} to ${storagePath}`);
