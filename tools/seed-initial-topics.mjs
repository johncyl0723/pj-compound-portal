import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const project = "pnj-compound-company-limited";
const config = JSON.parse(await readFile(join(homedir(), ".config", "configstore", "firebase-tools.json"), "utf8"));
const token = config.tokens.access_token;

const docs = [
  {
    id: "topic-rmp-20260520",
    title: "解析RMP_新貨幣時代的序幕解碼RMP",
    body: "解析RMP_新貨幣時代的序幕解碼RMP",
    originalFileName: "RMP制度_新貨幣時代的序幕解碼.pdf",
  },
  {
    id: "topic-slr-20260520",
    title: "SLR改革_財政主導的金融新時代",
    body: "SLR改革_財政主導的金融新時代",
    originalFileName: "SLR改革_財政主導的金融新時代.pdf",
  },
];

for (const item of docs) {
  const body = {
    fields: {
      title: { stringValue: item.title },
      body: { stringValue: item.body },
      originalFileName: { stringValue: item.originalFileName },
    },
  };
  const url = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/portalTopics/${item.id}?updateMask.fieldPaths=title&updateMask.fieldPaths=body&updateMask.fieldPaths=originalFileName`;
  const response = await fetch(url, {
    method: "PATCH",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
  console.log(`${item.id} seeded`);
}
