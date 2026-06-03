import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { basename, join } from "node:path";
import { homedir } from "node:os";
import { pipeline } from "node:stream/promises";

const projectId = process.env.FIREBASE_PROJECT_ID || "pnj-compound-company-limited";
const bucket = process.env.FIREBASE_STORAGE_BUCKET || "pnj-compound-company-limited.firebasestorage.app";
const backupDir = process.argv[2] || "G:\\其他電腦\\公司電腦\\Google Drive Sync\\Z. 個人投資理財\\0.知識庫\\Z. 動態網站_財經議題資料區";

function safeFileName(name) {
  return String(name || "topic.pdf")
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_");
}

async function firebaseToken() {
  const configPath = join(homedir(), ".config", "configstore", "firebase-tools.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const token = config?.tokens?.access_token;
  if (!token) throw new Error("Firebase CLI access token was not found. Run npx firebase-tools login.");
  return token;
}

function fieldValue(fields, key) {
  const field = fields?.[key];
  if (!field) return "";
  if ("stringValue" in field) return field.stringValue;
  if ("booleanValue" in field) return field.booleanValue;
  if ("integerValue" in field) return Number(field.integerValue);
  return "";
}

const token = await firebaseToken();
await mkdir(backupDir, { recursive: true });

const queryUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
const query = { structuredQuery: { from: [{ collectionId: "portalTopics" }] } };
const topicResponse = await fetch(queryUrl, {
  method: "POST",
  headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  body: JSON.stringify(query),
});
if (!topicResponse.ok) throw new Error(await topicResponse.text());

const rows = await topicResponse.json();
const manifest = [];

for (const row of rows) {
  const fields = row.document?.fields;
  if (!fields || fieldValue(fields, "active") === false) continue;

  const storagePath = fieldValue(fields, "storagePath");
  if (!storagePath) continue;

  const originalFileName = fieldValue(fields, "originalFileName") || `${fieldValue(fields, "title") || basename(storagePath)}.pdf`;
  const targetPath = join(backupDir, safeFileName(originalFileName));
  const encodedObject = encodeURIComponent(storagePath);
  const downloadUrl = `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodedObject}?alt=media`;
  const downloadResponse = await fetch(downloadUrl, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!downloadResponse.ok) throw new Error(await downloadResponse.text());

  await pipeline(downloadResponse.body, createWriteStream(targetPath));
  manifest.push({
    title: fieldValue(fields, "title"),
    originalFileName,
    storagePath,
    backupPath: targetPath,
    syncedAt: new Date().toISOString(),
  });
}

await writeFile(join(backupDir, "topics-manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
console.log(`Synced ${manifest.length} topic file(s) to: ${backupDir}`);
