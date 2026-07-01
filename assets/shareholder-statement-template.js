const DEFAULT_NOTES = [
  "1. 以上股東持股單位數係依股東實際投入日期適用當月之淨值計算取得之單位數。",
  "2. 依照投資合同，自2025年起每半年配息2%，因美金匯費成本較高，建議各位股東開立國泰世華帳號，減少匯款手續費負擔。",
  "3. 2026年第1次配發日訂在2026年7月6日。",
];

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function num(value, digits = 2) {
  if (value === null || value === undefined || value === "") return "";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return String(value);
  return parsed.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function numFlexible(value) {
  if (value === null || value === undefined || value === "") return "";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return String(value);
  const isInt = Math.abs(parsed % 1) < 1e-9;
  return parsed.toLocaleString("en-US", {
    minimumFractionDigits: isInt ? 0 : 2,
    maximumFractionDigits: isInt ? 0 : 2,
  });
}

function pct(value) {
  if (value === null || value === undefined || value === "") return "";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return String(value);
  return `${parsed.toFixed(2)}%`;
}

function formatDate(value) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    return String(value).replace(/-/g, "/");
  }
  return String(value);
}

function normalizeArray(rows) {
  return Array.isArray(rows) ? rows.filter(Boolean) : [];
}

export function hasStatementStructuredData(entry) {
  return !!entry && (
    entry.renderMode === "structured-html" ||
    Array.isArray(entry.dividendRows) ||
    Array.isArray(entry.contributionRows)
  );
}

export function normalizeStatementData(entry = {}) {
  const dividendRows = normalizeArray(entry.dividendRows).map((row, index) => ({
    year: row.year ?? "",
    amount: row.amount ?? "",
    method: row.method ?? "",
    sortOrder: row.sortOrder ?? index + 1,
  })).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

  const contributionRows = normalizeArray(entry.contributionRows).map((row, index) => ({
    shareholderName: row.shareholderName ?? entry.shareholderName ?? "",
    fundedAmount: row.fundedAmount ?? "",
    contributionDate: row.contributionDate ?? "",
    navDateLabel: row.navDateLabel ?? "",
    navDate: row.navDate ?? "",
    buyNavPerUnit: row.buyNavPerUnit ?? "",
    unitsAcquired: row.unitsAcquired ?? "",
    remark: row.remark ?? "",
    sortOrder: row.sortOrder ?? index + 1,
  })).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

  const notes = normalizeArray(entry.notes).length ? normalizeArray(entry.notes) : [...DEFAULT_NOTES];

  return {
    reportType: entry.reportType || "股東持有權益份額報告書",
    shareholderCode: entry.shareholderCode || "",
    shareholderName: entry.shareholderName || entry.displayName || "",
    shareClass: entry.shareClass || "",
    currency: entry.currency || "USD",
    endDate: entry.endDate || "",
    navPerUnit: entry.navPerUnit ?? "",
    investedAmountUsd: entry.investedAmountUsd ?? "",
    unitsHeld: entry.unitsHeld ?? "",
    ownershipPercent: entry.ownershipPercent ?? "",
    marketValueUsd: entry.marketValueUsd ?? "",
    gainUsd: entry.gainUsd ?? "",
    returnRatePercent: entry.returnRatePercent ?? "",
    dividendRows,
    contributionRows,
    notes,
  };
}

export function buildShareholderStatementHtml(entry = {}) {
  const data = normalizeStatementData(entry);
  const navLabel = data.navPerUnit === "" ? "" : num(Number(data.navPerUnit), 4);
  const summaryRows = [
    ["持股份總類", data.shareClass ? `${data.shareClass === "PS" ? "特別股" : data.shareClass === "CS" ? "普通股" : data.shareClass}_${data.shareClass}` : ""],
    ["已投資股份金額_USD", num(data.investedAmountUsd)],
    ["持有權益單位數_Units", numFlexible(data.unitsHeld)],
    ["持有權益比例_%", pct(data.ownershipPercent)],
    ["目前持有權益市值_USD", num(data.marketValueUsd)],
    ["投資增值_USD", num(data.gainUsd)],
    ["累計增值報酬率_%", pct(data.returnRatePercent)],
  ];
  const dividendHtml = (data.dividendRows.length ? data.dividendRows : [{}, {}, {}, {}]).slice(0, 4).map((row) => `
      <tr>
        <td>${esc(row.year || "")}</td>
        <td>${esc(row.amount === "" || row.amount === undefined ? "" : num(row.amount))}</td>
        <td>${esc(row.method || "")}</td>
      </tr>`).join("");
  const contributionsHtml = data.contributionRows.map((row) => `
      <tr>
        <td>${esc(row.shareholderName)}</td>
        <td class="num">${esc(num(row.fundedAmount))}</td>
        <td>${esc(formatDate(row.contributionDate))}</td>
        <td>${esc(row.navDateLabel || formatDate(row.navDate))}</td>
        <td class="num">${esc(row.buyNavPerUnit === "" ? "" : num(Number(row.buyNavPerUnit), 4))}</td>
        <td class="num">${esc(numFlexible(row.unitsAcquired))}</td>
        <td>${esc(row.remark || "")}</td>
      </tr>`).join("");
  const totalRow = `
      <tr class="total-row">
        <td></td>
        <td class="num">${esc(num(data.investedAmountUsd))}</td>
        <td></td>
        <td></td>
        <td></td>
        <td class="num">${esc(numFlexible(data.unitsHeld))}</td>
        <td class="num">${esc(pct(data.ownershipPercent))}</td>
      </tr>`;
  const notesHtml = data.notes.map((note) => `<div>${esc(note)}</div>`).join("");

  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(data.shareholderName)} - 股東持股報告</title>
<style>
  :root {
    --blue: #3a7dbc;
    --yellow: #fff100;
    --soft: #f5dfcf;
    --orange: #f0741a;
    --red: #ff1616;
    --text: #222;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #f0f0f0;
    font-family: "Times New Roman", "PMingLiU", "MingLiU", serif;
    color: var(--text);
  }
  .page {
    width: 794px;
    min-height: 1123px;
    margin: 0 auto;
    background: #fff;
    padding: 44px 54px 48px;
  }
  .top-note {
    text-align: right;
    color: var(--red);
    font-size: 14px;
    margin-bottom: 6px;
  }
  .section-bar {
    background: var(--blue);
    color: var(--yellow);
    text-align: center;
    font-weight: 700;
    font-size: 14px;
    line-height: 24px;
    margin-bottom: 16px;
  }
  .profile {
    display: grid;
    grid-template-columns: 1fr 250px;
    gap: 22px;
    margin-bottom: 18px;
  }
  .profile-grid {
    display: grid;
    grid-template-columns: 175px 1fr;
    gap: 0 8px;
    align-content: start;
    font-size: 14px;
    line-height: 1.35;
  }
  .profile-grid .value {
    display: inline-block;
    background: var(--soft);
    padding: 2px 6px;
    min-height: 24px;
  }
  .profile-grid .code {
    text-align: center;
    color: #ff2b00;
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 1px;
  }
  .logo-box {
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
  }
  .logo-main {
    font-family: Arial, sans-serif;
    font-weight: 800;
    font-size: 46px;
    color: #e61e24;
    line-height: 1;
  }
  .logo-main span {
    color: #6f87dd;
    display: block;
    font-size: 28px;
    margin-top: 6px;
  }
  .logo-sub {
    color: #666;
    font-size: 12px;
    margin-top: 2px;
  }
  .logo-slogan {
    color: var(--orange);
    font-size: 18px;
    margin-top: 4px;
  }
  .summary {
    display: grid;
    grid-template-columns: 1fr 390px;
    gap: 20px;
    margin-bottom: 20px;
  }
  .summary-grid {
    display: grid;
    grid-template-columns: 180px 1fr;
    gap: 0 10px;
    font-size: 14px;
    line-height: 1.55;
    align-content: start;
  }
  .summary-grid .value {
    background: #f7e3d3;
    padding: 2px 8px;
    text-align: right;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  .dividend-table {
    font-size: 13px;
  }
  .dividend-table th,
  .dividend-table td {
    border: 1px solid #222;
    text-align: center;
    padding: 2px 4px;
    height: 24px;
  }
  .dividend-table th {
    color: #ff2b00;
    background: var(--yellow);
    font-weight: 700;
  }
  .detail-table {
    font-size: 12px;
    margin-top: 2px;
  }
  .detail-table th,
  .detail-table td {
    border: 1px solid #222;
    padding: 2px 4px;
    text-align: center;
    height: 22px;
  }
  .detail-table th {
    font-weight: 400;
  }
  .detail-table td:first-child,
  .detail-table th:first-child {
    text-align: left;
  }
  .detail-table .num {
    text-align: right;
  }
  .detail-table .total-row td {
    background: var(--yellow);
  }
  .notes {
    color: var(--orange);
    font-size: 12px;
    line-height: 1.7;
    padding: 0 4px;
  }
  @media (max-width: 820px) {
    .page {
      width: 100%;
      min-height: auto;
      padding: 24px 12px 32px;
    }
    .profile,
    .summary {
      grid-template-columns: 1fr;
    }
    .profile-grid,
    .summary-grid {
      grid-template-columns: 150px 1fr;
      font-size: 13px;
    }
    .logo-main {
      font-size: 38px;
    }
  }
</style>
</head>
<body>
  <div class="page">
    <div class="top-note">(For Information Purpose Only)</div>
    <div class="section-bar">P&amp;J Compound Company Limited_股東基本資料_Report Profile</div>

    <div class="profile">
      <div class="profile-grid">
        <div>報告性質_Attributes：</div><div class="value">${esc(data.reportType)}</div>
        <div>股東姓名_Name：</div><div class="value"><strong>${esc(data.shareholderName)}</strong></div>
        <div>股東戶號_CIN：</div><div class="value code">${esc(data.shareholderCode.replace(/^([A-Z]{2})(\d{3})$/, "$1- $2"))}</div>
        <div>報告幣別_Currency:</div><div class="value">${esc(data.currency)}</div>
        <div>計算截止日_ End Date：</div><div class="value">${esc(formatDate(data.endDate))}</div>
        <div>值：</div><div class="value" style="text-align:right">${esc(navLabel)}</div>
      </div>
      <div class="logo-box">
        <div>
          <div class="logo-main">P&amp;J<span>Compound Inc.</span></div>
          <div class="logo-sub">香港商富利創證券有限公司</div>
          <div class="logo-slogan">Focus, Insight, Value</div>
        </div>
      </div>
    </div>

    <div class="section-bar">股東持有權益總覽_Summary of shareholders' equity</div>

    <div class="summary">
      <div class="summary-grid">
        ${summaryRows.map(([label, value]) => `<div>${esc(label)}：</div><div class="value">${esc(value)}</div>`).join("")}
      </div>
      <div>
        <table class="dividend-table">
          <thead>
            <tr>
              <th>股利年度</th>
              <th>金額</th>
              <th>領取方式</th>
            </tr>
          </thead>
          <tbody>${dividendHtml}</tbody>
        </table>
      </div>
    </div>

    <div class="section-bar">股東投入資金明細及享有股東權益計算_<br>Details of shareholders' capital contribution and calculation of shareholders' equity.</div>

    <table class="detail-table">
      <thead>
        <tr>
          <th>股東名稱</th>
          <th>已到位<br>投資金額</th>
          <th>投入日期</th>
          <th>適用每單位<br>淨值日期</th>
          <th>買入<br>每單位淨值</th>
          <th>取得單位數：<br>每單位面額1元</th>
          <th>持股比例/備註</th>
        </tr>
      </thead>
      <tbody>
        ${contributionsHtml}
        ${totalRow}
      </tbody>
    </table>

    <div class="section-bar" style="margin-top:18px">說明事項_Explanatory Notes</div>
    <div class="notes">${notesHtml}</div>
  </div>
</body>
</html>`;
}

export { DEFAULT_NOTES };
