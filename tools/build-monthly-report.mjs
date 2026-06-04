import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

function usage() {
  console.error('Usage: node tools/build-monthly-report.mjs <config-module>');
  process.exit(1);
}

const configArg = process.argv[2];
if (!configArg) usage();

const configPath = path.resolve(configArg);
const {default: report} = await import(pathToFileURL(configPath).href);

const templatePath = path.resolve(report.templatePath);
const outputPath = path.resolve(report.outputPath);

function fmtNumber(value) {
  return Number(value).toLocaleString('en-US', {maximumFractionDigits: 0});
}

function fmtPct(value) {
  const n = Number(value);
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function fmtPctPlain(value) {
  return `${Number(value).toFixed(2)}%`;
}

function fmtMoneyChip(value) {
  return `${value >= 0 ? '+' : '-'}${fmtNumber(Math.abs(value))} USD`;
}

function fmtParens(value) {
  return value < 0 ? `(${fmtNumber(Math.abs(value))})` : fmtNumber(value);
}

function pctClass(value) {
  return value > 0 ? 'up' : (value < 0 ? 'down' : '');
}

function bucketArrayToJs(items) {
  return JSON.stringify(items, null, 2)
    .replace(/"([^"]+)":/g, '$1:')
    .replace(/"([^"]*)"/g, (_, s) => `'${s.replace(/'/g, "\\'")}'`);
}

function replaceSection(source, startMarker, endMarker, innerHtml) {
  const start = source.indexOf(startMarker);
  if (start === -1) throw new Error(`Missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  if (end === -1) throw new Error(`Missing end marker: ${endMarker}`);
  return `${source.slice(0, start)}${startMarker}\n${innerHtml}\n${source.slice(end)}`;
}

function replaceBetween(source, startToken, endToken, replacement) {
  const start = source.indexOf(startToken);
  if (start === -1) throw new Error(`Missing token: ${startToken}`);
  const end = source.indexOf(endToken, start);
  if (end === -1) throw new Error(`Missing token: ${endToken}`);
  return `${source.slice(0, start)}${replacement}\n\n${source.slice(end)}`;
}

function replaceRegex(source, pattern, replacement, label) {
  if (!pattern.test(source)) throw new Error(`Missing pattern: ${label}`);
  return source.replace(pattern, replacement);
}

function buildOverviewSection(data) {
  const currentRows = data.currentMonthComparison.map((row) => {
    const cls = pctClass(row.value);
    return `<tr${row.highlight ? ' class="highlight-row"' : ''}><td>${row.label}</td><td class="${cls}">${fmtPct(row.value)}</td></tr>`;
  }).join('\n            ');

  return `  <div class="section-title">投資組合總覽 <span class="en">Portfolio Overview — ${data.reportMonthEn}</span></div>

  <div class="grid grid-4" style="margin-bottom:20px">
    <div class="kpi primary">
      <div class="label">投資組合淨值</div>
      <div class="value">${fmtNumber(data.nav)}</div>
      <div class="sub">USD 計價</div>
    </div>
    <div class="kpi gold">
      <div class="label">年初至今報酬率</div>
      <div class="value ${pctClass(data.ytdReturn)}">${fmtPct(data.ytdReturn)}</div>
      <div class="sub"><span class="chip ${pctClass(data.ytdChange)}">${fmtMoneyChip(data.ytdChange)}</span></div>
    </div>
    <div class="kpi">
      <div class="label">累計已實現損益</div>
      <div class="value ${pctClass(data.cumulativeRealized)}">${fmtNumber(data.cumulativeRealized)}</div>
      <div class="sub">本年度 ${fmtMoneyChip(data.currentYearRealized)}</div>
    </div>
    <div class="kpi">
      <div class="label">累計未實現損益</div>
      <div class="value ${pctClass(data.cumulativeUnrealized)}">${fmtNumber(data.cumulativeUnrealized)}</div>
      <div class="sub">本年度 ${fmtParens(data.currentYearUnrealized)}</div>
    </div>
  </div>

  <div class="card" style="margin-bottom:20px">
    <div class="card-title">各月績效走勢 Monthly Performance <span style="font-size:10px;color:var(--muted);font-weight:400">(2023 Q4 — ${data.reportRangeEnd})</span></div>
    <div class="bm-bar" id="bm-bar-overview">
      <span class="bm-bar-label">比較基準</span>
      <span class="bm-fixed"><span class="bm-dot"></span>P&amp;J 組合</span>
      <button class="bm-btn off" data-bm="sp" onclick="toggleBm(this,'overview')"><span class="bm-dot"></span>S&amp;P 10Y公債</button>
      <button class="bm-btn off" data-bm="ml" onclick="toggleBm(this,'overview')"><span class="bm-dot"></span>美林 IG 債</button>
      <button class="bm-btn off" data-bm="b720" onclick="toggleBm(this,'overview')"><span class="bm-dot"></span>00720B</button>
      <button class="bm-btn off" data-bm="b772" onclick="toggleBm(this,'overview')"><span class="bm-dot"></span>00772B</button>
      <button class="bm-btn off" data-bm="b785" onclick="toggleBm(this,'overview')"><span class="bm-dot"></span>00785B</button>
    </div>
    <div class="chart-wrap"><canvas id="chartMonthly"></canvas></div>
  </div>

  <div class="two-col">
    <div class="card">
      <div class="card-title">各年度績效 Annual Return</div>
      <div class="chart-wrap-sm"><canvas id="chartAnnual"></canvas></div>
    </div>
    <div class="card">
      <div class="card-title">本月績效 vs 同期基準</div>
      <div style="padding-top:8px">
        <table>
          <thead><tr><th>指數 / 基金</th><th>本月報酬</th></tr></thead>
          <tbody>
            ${currentRows}
          </tbody>
        </table>
      </div>
    </div>
  </div>`;
}

function buildPerformanceSection(data) {
  const footerReturns = Object.values(data.cumulativeReturns);
  const footerMdd = Object.values(data.maxDrawdown);

  return `  <div class="section-title">績效比較報告 <span class="en">Portfolio Comparison Summary</span></div>

  <div class="grid grid-4" style="margin-bottom:20px">
    <div class="kpi primary">
      <div class="label">累計總報酬率</div>
      <div class="value up">${fmtPct(data.cumulativeReturns.pj)}</div>
      <div class="sub">起始日 ${data.inceptionLabel}</div>
    </div>
    <div class="kpi">
      <div class="label">最大回撤 MDD</div>
      <div class="value down">${fmtPct(data.maxDrawdown.pj)}</div>
      <div class="sub">vs 美林 IG ${fmtPct(data.maxDrawdown.ml)}</div>
    </div>
    <div class="kpi gold">
      <div class="label">vs 美林 IG 債</div>
      <div class="value up">${fmtPct(data.cumulativeReturns.pj - data.cumulativeReturns.ml)}</div>
      <div class="sub">${fmtPct(data.cumulativeReturns.pj)} vs ${fmtPct(data.cumulativeReturns.ml)}</div>
    </div>
    <div class="kpi">
      <div class="label">vs 00720B</div>
      <div class="value up">${fmtPct(data.cumulativeReturns.pj - data.cumulativeReturns.b720)}</div>
      <div class="sub">${fmtPct(data.cumulativeReturns.pj)} vs ${fmtPct(data.cumulativeReturns.b720)}</div>
    </div>
  </div>

  <div class="bm-bar" id="bm-bar-perf">
    <span class="bm-bar-label">顯示基準</span>
    <span class="bm-fixed"><span class="bm-dot"></span>P&amp;J 組合</span>
    <button class="bm-btn off" data-bm="sp" onclick="toggleBm(this,'perf')"><span class="bm-dot"></span>S&amp;P 10Y公債</button>
    <button class="bm-btn off" data-bm="ml" onclick="toggleBm(this,'perf')"><span class="bm-dot"></span>美林 IG 債</button>
    <button class="bm-btn off" data-bm="b720" onclick="toggleBm(this,'perf')"><span class="bm-dot"></span>00720B</button>
    <button class="bm-btn off" data-bm="b772" onclick="toggleBm(this,'perf')"><span class="bm-dot"></span>00772B</button>
    <button class="bm-btn off" data-bm="b785" onclick="toggleBm(this,'perf')"><span class="bm-dot"></span>00785B</button>
  </div>

  <div class="card" style="margin-bottom:20px">
    <div class="card-title">績效走勢對比 Performance Trend <span style="font-size:10px;font-weight:400;color:var(--muted)">(2023 Q4 — ${data.reportRangeEnd})</span></div>
    <div class="chart-wrap"><canvas id="chartPerfLine"></canvas></div>
  </div>

  <div class="card">
    <div class="card-title">歷史績效比較 Monthly Performance Comparison</div>
    <div class="perf-table-wrap">
      <table class="perf-table" id="perf-table">
        <thead>
          <tr>
            <th>期間</th>
            <th>P&amp;J 組合</th>
            <th class="bm-col hidden" data-bm="sp">S&amp;P 10Y公債</th>
            <th class="bm-col hidden" data-bm="ml">美林 IG 債</th>
            <th class="bm-col hidden" data-bm="b720">00720B</th>
            <th class="bm-col hidden" data-bm="b772">00772B</th>
            <th class="bm-col hidden" data-bm="b785">00785B</th>
          </tr>
        </thead>
        <tbody id="perf-tbody"></tbody>
        <tfoot id="perf-tfoot">
          <tr class="tfoot-row">
            <td>累計報酬率</td>
            <td class="${pctClass(footerReturns[0])}">${fmtPct(footerReturns[0])}</td>
            <td class="bm-col hidden" data-bm="sp">${fmtPct(footerReturns[1])}</td>
            <td class="bm-col hidden" data-bm="ml">${fmtPct(footerReturns[2])}</td>
            <td class="bm-col hidden" data-bm="b720">${fmtPct(footerReturns[3])}</td>
            <td class="bm-col hidden" data-bm="b772">${fmtPct(footerReturns[4])}</td>
            <td class="bm-col hidden" data-bm="b785">${fmtPct(footerReturns[5])}</td>
          </tr>
          <tr class="tfoot-row">
            <td>最大回撤 MDD</td>
            <td class="down">${fmtPct(footerMdd[0])}</td>
            <td class="bm-col hidden" data-bm="sp" style="color:var(--neg)">${fmtPct(footerMdd[1])}</td>
            <td class="bm-col hidden" data-bm="ml" style="color:var(--neg)">${fmtPct(footerMdd[2])}</td>
            <td class="bm-col hidden" data-bm="b720" style="color:var(--neg)">${fmtPct(footerMdd[3])}</td>
            <td class="bm-col hidden" data-bm="b772" style="color:var(--neg)">${fmtPct(footerMdd[4])}</td>
            <td class="bm-col hidden" data-bm="b785" style="color:var(--neg)">${fmtPct(footerMdd[5])}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>`;
}

function buildAllocationSection(data) {
  const rows = data.assetDetailRows.map((row) => (
    `<tr><td>${row.name}</td><td>${row.amount}</td><td>${row.yield}</td><td>${row.note}</td></tr>`
  )).join('\n          ');

  const usdWidth = (data.usdBond / (data.usdCash + data.usdBond + data.usdPgn)) * 100;
  const usdPgnWidth = (data.usdPgn / (data.usdCash + data.usdBond + data.usdPgn)) * 100;
  const usdCashWidth = (data.usdCash / (data.usdCash + data.usdBond + data.usdPgn)) * 100;
  const gbpCashWidth = (data.gbpCash / (data.gbpCash + data.gbpBond)) * 100;
  const gbpBondWidth = (data.gbpBond / (data.gbpCash + data.gbpBond)) * 100;
  const twdCashWidth = (data.twdCash / (data.twdCash + data.twdPreferred)) * 100;
  const twdPreferredWidth = (data.twdPreferred / (data.twdCash + data.twdPreferred)) * 100;

  return `  <div class="section-title">資產配置明細 <span class="en">Asset Allocation Detail</span></div>

  <div class="two-col" style="margin-bottom:20px">
    <div style="display:flex;flex-direction:column;gap:10px">
      <div class="card" style="border-left:3px solid #1d4ed8;padding:14px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
          <span style="padding:2px 9px;background:#dbeafe;color:#1d4ed8;border-radius:4px;font-weight:700;font-size:12px">USD</span>
          <span style="font-size:11px;color:var(--muted);font-weight:600;letter-spacing:.5px;text-transform:uppercase">美元資產</span>
        </div>
        <div style="font-size:12px;display:flex;flex-direction:column;gap:7px">
          <div>
            <div style="display:flex;justify-content:space-between;margin-bottom:3px"><span style="color:var(--muted)">銀行存款</span><span style="font-variant-numeric:tabular-nums">${fmtNumber(data.usdCash)} USD</span></div>
            <div style="height:3px;background:#f0f0f0;border-radius:2px"><div style="width:${usdCashWidth.toFixed(1)}%;height:100%;background:#1d4ed8;border-radius:2px"></div></div>
          </div>
          <div>
            <div style="display:flex;justify-content:space-between;margin-bottom:3px"><span style="color:var(--muted)">PGN</span><span style="font-variant-numeric:tabular-nums">${fmtNumber(data.usdPgn)} USD</span></div>
            <div style="height:3px;background:#f0f0f0;border-radius:2px"><div style="width:${usdPgnWidth.toFixed(1)}%;height:100%;background:#60a5fa;border-radius:2px"></div></div>
          </div>
          <div>
            <div style="display:flex;justify-content:space-between;margin-bottom:3px"><span style="color:var(--muted)">債券</span><span style="font-weight:600;font-variant-numeric:tabular-nums">${fmtNumber(data.usdBond)} USD</span></div>
            <div style="height:3px;background:#f0f0f0;border-radius:2px"><div style="width:${usdWidth.toFixed(1)}%;height:100%;background:#1d4ed8;border-radius:2px"></div></div>
          </div>
        </div>
        <div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border);font-size:11px;color:var(--muted);display:flex;justify-content:space-between">
          <span>資產收益區間</span><span>1.35% ~ 9.56%</span>
        </div>
      </div>

      <div class="card" style="border-left:3px solid #6d28d9;padding:14px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
          <span style="padding:2px 9px;background:#ede9fe;color:#6d28d9;border-radius:4px;font-weight:700;font-size:12px">GBP</span>
          <span style="font-size:11px;color:var(--muted);font-weight:600;letter-spacing:.5px;text-transform:uppercase">英鎊資產</span>
        </div>
        <div style="font-size:12px;display:flex;flex-direction:column;gap:7px">
          <div>
            <div style="display:flex;justify-content:space-between;margin-bottom:3px"><span style="color:var(--muted)">銀行存款</span><span style="font-variant-numeric:tabular-nums">${fmtNumber(data.gbpCash)} GBP</span></div>
            <div style="height:3px;background:#f0f0f0;border-radius:2px"><div style="width:${gbpCashWidth.toFixed(1)}%;height:100%;background:#6d28d9;border-radius:2px"></div></div>
          </div>
          <div>
            <div style="display:flex;justify-content:space-between;margin-bottom:3px"><span style="color:var(--muted)">債券</span><span style="font-weight:600;font-variant-numeric:tabular-nums">${fmtNumber(data.gbpBond)} GBP</span></div>
            <div style="height:3px;background:#f0f0f0;border-radius:2px"><div style="width:${gbpBondWidth.toFixed(1)}%;height:100%;background:#6d28d9;border-radius:2px"></div></div>
          </div>
        </div>
        <div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border);font-size:11px;color:var(--muted);display:flex;justify-content:space-between">
          <span>資產收益區間</span><span>5.50% ~ 8.20%</span>
        </div>
      </div>

      <div class="card" style="border-left:3px solid #B8860B;padding:14px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
          <span style="padding:2px 9px;background:rgba(184,134,11,.15);color:#7a5200;border-radius:4px;font-weight:700;font-size:12px">TWD</span>
          <span style="font-size:11px;color:var(--muted);font-weight:600;letter-spacing:.5px;text-transform:uppercase">台幣資產</span>
        </div>
        <div style="font-size:12px;display:flex;flex-direction:column;gap:7px">
          <div>
            <div style="display:flex;justify-content:space-between;margin-bottom:3px"><span style="color:var(--muted)">銀行存款</span><span style="font-variant-numeric:tabular-nums">${fmtNumber(data.twdCash)} TWD</span></div>
            <div style="height:3px;background:#f0f0f0;border-radius:2px"><div style="width:${twdCashWidth.toFixed(1)}%;height:100%;background:#B8860B;border-radius:2px"></div></div>
          </div>
          <div>
            <div style="display:flex;justify-content:space-between;margin-bottom:3px"><span style="color:var(--muted)">特別股</span><span style="font-weight:600;font-variant-numeric:tabular-nums">${fmtNumber(data.twdPreferred)} TWD</span></div>
            <div style="height:3px;background:#f0f0f0;border-radius:2px"><div style="width:${twdPreferredWidth.toFixed(1)}%;height:100%;background:#B8860B;border-radius:2px"></div></div>
          </div>
        </div>
        <div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border);font-size:11px;color:var(--muted);display:flex;justify-content:space-between">
          <span>資產收益區間</span><span>1.20% ~ 4.50%</span>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">各類資產報酬 / 成本明細</div>
      <table>
        <thead><tr><th>資產項目</th><th>金額</th><th>報酬 / 成本</th><th>備註</th></tr></thead>
        <tbody>
          ${rows}
          <tr class="tfoot-row"><td>總資產</td><td>${fmtNumber(data.totalAssets)}</td><td>USD 計價</td><td>月報摘要</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="card">
    <div class="card-title">資產負債與淨值摘要</div>
    <div class="grid grid-3">
      <div class="kpi">
        <div class="label">總資產</div>
        <div class="value">${fmtNumber(data.totalAssets)}</div>
        <div class="sub">USD</div>
      </div>
      <div class="kpi">
        <div class="label">抵押借款</div>
        <div class="value down">${fmtNumber(data.borrowingUsd)}</div>
        <div class="sub">LTV ${fmtPctPlain(data.ltv)}｜尚可動用 ${data.availableCreditTwd} TWD</div>
      </div>
      <div class="kpi primary">
        <div class="label">股東淨值</div>
        <div class="value">${fmtNumber(data.nav)}</div>
        <div class="sub">股東投入 ${fmtNumber(data.shareholderCapital)} + 未分配盈餘 ${fmtNumber(data.retainedEarnings)}</div>
      </div>
    </div>
  </div>`;
}

function buildIncomeSection(data) {
  return `  <div class="section-title">損益表 <span class="en">P&amp;L Summary</span></div>

  <div class="grid grid-4" style="margin-bottom:20px">
    <div class="kpi primary">
      <div class="label">本月淨值</div>
      <div class="value">${fmtNumber(data.nav)}</div>
      <div class="sub">USD</div>
    </div>
    <div class="kpi">
      <div class="label">本年度已實現損益</div>
      <div class="value ${pctClass(data.currentYearRealized)}">${fmtMoneyChip(data.currentYearRealized).replace(' USD', '')}</div>
      <div class="sub">累計 ${fmtNumber(data.cumulativeRealized)}</div>
    </div>
    <div class="kpi">
      <div class="label">本年度未實現損益</div>
      <div class="value ${pctClass(data.currentYearUnrealized)}">${fmtParens(data.currentYearUnrealized)}</div>
      <div class="sub">累計 ${fmtNumber(data.cumulativeUnrealized)}</div>
    </div>
    <div class="kpi gold">
      <div class="label">本年度淨值變動</div>
      <div class="value ${pctClass(data.ytdChange)}">${fmtMoneyChip(data.ytdChange).replace(' USD', '')}</div>
      <div class="sub">增減率 ${fmtPct(data.ytdReturn)}</div>
    </div>
  </div>

  <div class="two-col">
    <div class="card">
      <div class="card-title">投資組合資產負債表 Balance Sheet</div>
      <table>
        <thead><tr><th>項目</th><th>金額 (USD)</th></tr></thead>
        <tbody>
          <tr><td colspan="2" style="background:#f8f5ef;font-weight:700;color:var(--green);font-size:11px;letter-spacing:.5px">資產</td></tr>
          <tr><td>存款類</td><td>${fmtNumber(data.balanceSheet.cashDeposits)}</td></tr>
          <tr><td>貨幣基金類</td><td>${data.balanceSheet.moneyMarket ? fmtNumber(data.balanceSheet.moneyMarket) : '—'}</td></tr>
          <tr><td>固定收益證券類</td><td>${fmtNumber(data.balanceSheet.fixedIncome)}</td></tr>
          <tr><td>應收利息</td><td>${fmtNumber(data.balanceSheet.accruedInterest)}</td></tr>
          <tr><td>投資台灣分公司</td><td>${fmtNumber(data.balanceSheet.twBranch)}</td></tr>
          <tr class="tfoot-row"><td>總資產</td><td>${fmtNumber(data.totalAssets)}</td></tr>
          <tr><td colspan="2" style="background:#f8f5ef;font-weight:700;color:var(--green);font-size:11px;letter-spacing:.5px">負債</td></tr>
          <tr><td>抵押借款</td><td>${fmtNumber(data.balanceSheet.borrowing)}</td></tr>
          <tr><td>應付費用</td><td>${fmtNumber(data.balanceSheet.accruedExpense)}</td></tr>
          <tr><td colspan="2" style="background:#f8f5ef;font-weight:700;color:var(--green);font-size:11px;letter-spacing:.5px">股東權益</td></tr>
          <tr><td>股東投入</td><td>${fmtNumber(data.shareholderCapital)}</td></tr>
          <tr><td>累計未分配盈餘</td><td>${fmtNumber(data.retainedEarnings)}</td></tr>
          <tr class="tfoot-row"><td>淨值 (NAV)</td><td>${fmtNumber(data.nav)}</td></tr>
        </tbody>
      </table>
    </div>
    <div class="card">
      <div class="card-title">累計損益走勢</div>
      <div class="chart-wrap"><canvas id="chartPnl"></canvas></div>
    </div>
  </div>`;
}

function buildBondsSection(data) {
  return `  <div class="section-title">債券持有明細 <span class="en">Bond Portfolio Detail</span></div>

  <div class="card" style="margin-bottom:20px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <div style="font-size:12px;color:var(--muted)">報表日 ${data.reportDate} &nbsp;|&nbsp; 英鎊 / 美元匯率 ${data.gbpUsdRate} &nbsp;|&nbsp; 折算美元本金 ${fmtNumber(data.bondTotalUsd)}</div>
    </div>
    <div class="table-scroll">
      <table id="bond-table">
        <thead>
          <tr>
            <th>幣別</th>
            <th>名目本金</th>
            <th>折算美元</th>
            <th>債券名稱</th>
            <th>票面利率</th>
            <th>市值 (USD)</th>
            <th>性質</th>
            <th>評等</th>
            <th>到期年限</th>
            <th>下次 Call</th>
            <th>質押 / 狀態</th>
            <th>保管銀行</th>
          </tr>
        </thead>
        <tbody id="bond-tbody"></tbody>
        <tfoot>
          <tr class="tfoot-row">
            <td colspan="2">Total</td>
            <td>${fmtNumber(data.bondTotalUsd)}</td>
            <td colspan="2"></td>
            <td>${fmtNumber(data.bondMarketValue)}</td>
            <td colspan="6"></td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>

  <div class="section-title section-gap">債券分布分析 <span class="en">Bond Distribution Analysis</span></div>
  <div class="dist-chart-row">
    <div class="card">
      <div class="card-title">到期年限分布 By Maturity</div>
      <div class="chart-wrap-sm"><canvas id="chartMaturity"></canvas></div>
    </div>
    <div class="card">
      <div class="card-title">下次贖回分布 By Next Call</div>
      <div class="chart-wrap-sm"><canvas id="chartCall"></canvas></div>
    </div>
    <div class="card">
      <div class="card-title">信用評等分布 By Rating</div>
      <div class="chart-wrap-sm"><canvas id="chartRating"></canvas></div>
    </div>
  </div>`;
}

function buildCashflowSection(data) {
  return `  <div class="section-title">債券現金流分析 <span class="en">Bond Cash Flow Analysis</span></div>

  <div class="cf-table-section">
    <div class="currency-tag usd-tag">USD 計價債券</div>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>年度</th>
            <th>USD 利息收入</th>
            <th>USD 本金回收</th>
            <th>現金流總額</th>
          </tr>
        </thead>
        <tbody id="cf-usd-tbody"></tbody>
        <tfoot>
          <tr class="tfoot-row">
            <td>合計</td>
            <td>${fmtNumber(data.cashflowTotals.usdInterest)}</td>
            <td>${fmtNumber(data.cashflowTotals.usdPrincipal)}</td>
            <td>${fmtNumber(data.cashflowTotals.usdTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>

  <div class="cf-table-section">
    <div class="currency-tag gbp-tag">GBP 計價債券</div>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>年度</th>
            <th>GBP 利息收入</th>
            <th>GBP 本金回收</th>
            <th>現金流總額</th>
          </tr>
        </thead>
        <tbody id="cf-gbp-tbody"></tbody>
        <tfoot>
          <tr class="tfoot-row">
            <td>合計</td>
            <td>${fmtNumber(data.cashflowTotals.gbpInterest)}</td>
            <td>${fmtNumber(data.cashflowTotals.gbpPrincipal)}</td>
            <td>${fmtNumber(data.cashflowTotals.gbpTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>

  <div class="card">
    <div class="card-title">年度現金流總覽 Annual Cash Flow Overview</div>
    <div class="chart-wrap"><canvas id="chartCashflow"></canvas></div>
  </div>`;
}

let html = await fs.readFile(templatePath, 'utf8');

html = html
  .replace('<title>投資月報 | P&amp;J Compound Company Limited | 2026/4</title>', `<title>投資月報 | P&amp;J Compound Company Limited | ${report.titleDate}</title>`)
  .replace('Portfolio Overview — Apr 2026', `Portfolio Overview — ${report.overview.reportMonthEn}`)
  .replace('(2023 Q4 — 2026 Apr)', `(2023 Q4 — ${report.overview.reportRangeEnd})`);

html = html.replace(/<div class="report-meta">[\s\S]*?<\/div>\s*<\/div>\s*<div style="max-width:1400px/m, `<div class="report-meta">
      <div><div class="label">報告期間</div><div class="val">${report.metaLabel}</div></div>
      <div><div class="label">計價幣別</div><div class="val">USD</div></div>
      <div><div class="label">成立日</div><div class="val">${report.inceptionDate}</div></div>
    </div>
  </div>
  <div style="max-width:1400px`);

html = replaceSection(
  html,
  '<div class="panel active" id="panel-overview">',
  '<div class="panel" id="panel-performance">',
  `${buildOverviewSection(report.overview)}\n</div>\n\n<div class="panel" id="panel-performance">`,
);
html = replaceSection(
  html,
  '<div class="panel" id="panel-performance">',
  '<div class="panel" id="panel-allocation">',
  `${buildPerformanceSection(report.performance)}\n</div>\n\n<div class="panel" id="panel-allocation">`,
);
html = replaceSection(
  html,
  '<div class="panel" id="panel-allocation">',
  '<div class="panel" id="panel-income">',
  `${buildAllocationSection(report.allocation)}\n</div>\n\n<div class="panel" id="panel-income">`,
);
html = replaceSection(
  html,
  '<div class="panel" id="panel-income">',
  '<div class="panel" id="panel-bonds">',
  `${buildIncomeSection(report.income)}\n</div>\n\n<div class="panel" id="panel-bonds">`,
);
html = replaceSection(
  html,
  '<div class="panel" id="panel-bonds">',
  '<div class="panel" id="panel-cashflow">',
  `${buildBondsSection(report.bonds)}\n</div>\n\n<div class="panel" id="panel-cashflow">`,
);
html = replaceSection(
  html,
  '<div class="panel" id="panel-cashflow">',
  '</main>',
  `${buildCashflowSection(report.cashflow)}\n</div>\n\n</main>`,
);

html = replaceBetween(
  html,
  'const PERF_DATA = [',
  '// from Excel',
  `const PERF_DATA = ${bucketArrayToJs(report.perfData)};\n\nconst BOND_DATA = ${bucketArrayToJs(report.bondData)};\n\n// from Excel`,
);
html = replaceBetween(
  html,
  'const CF_USD = [',
  'const GREEN =',
  `const CF_USD = ${bucketArrayToJs(report.cashflow.usdRows)};\nconst CF_GBP = ${bucketArrayToJs(report.cashflow.gbpRows)};`,
);

html = replaceRegex(
  html,
  /labels:\['2023 Q4','2024','2025','2026 YTD'\],\s+datasets:\[\{ label:'[^']*', data:\[[^\]]+\], backgroundColor:\[GREEN,GREEN,'rgba\(109,58,15,.7\)',GOLD\], borderRadius:4 \}\]/m,
  `labels:['2023 Q4','2024','2025','2026 YTD'],\n    datasets:[{ label:'年度報酬', data:${JSON.stringify(report.performance.annualReturns)}, backgroundColor:[GREEN,GREEN,'rgba(109,58,15,.7)',GOLD], borderRadius:4 }]`,
  'annual chart',
);
html = replaceRegex(
  html,
  /data:\[385379,172881,62278,-59835\],/,
  `data:${JSON.stringify(report.income.pnlChartValues)},`,
  'pnl chart',
);
html = replaceRegex(
  html,
  /labels:\['<1Y','1-3Y','3-5Y','5-7Y','7-10Y','>10Y'\],\s+datasets:\[\{ label:'[^']*', data:\[[^\]]+\], backgroundColor:GREEN, borderRadius:4 \}\]/m,
  `labels:['<1Y','1-3Y','3-5Y','5-7Y','7-10Y','>10Y'],\n    datasets:[{ label:'比例', data:${JSON.stringify(report.bonds.maturityDistribution)}, backgroundColor:GREEN, borderRadius:4 }]`,
  'maturity chart',
);
html = replaceRegex(
  html,
  /labels:\['<1Y','1-3Y','3-5Y','5-7Y','7-10Y'\],\s+datasets:\[\{ label:'[^']*', data:\[[^\]]+\], backgroundColor:GOLD, borderRadius:4 \}\]/m,
  `labels:['<1Y','1-3Y','3-5Y','5-7Y','7-10Y'],\n    datasets:[{ label:'比例', data:${JSON.stringify(report.bonds.callDistribution)}, backgroundColor:GOLD, borderRadius:4 }]`,
  'call chart',
);
html = replaceRegex(
  html,
  /labels:\['B','BB','BBB','[^']+'\],\s+datasets:\[\{ label:'[^']*', data:\[[^\]]+\], backgroundColor:\[GOLD,'rgba\(184,134,11,.6\)',LIGHT_GREEN,GREEN\], borderRadius:4 \}\]/m,
  `labels:['B','BB','BBB','≥A'],\n    datasets:[{ label:'比例', data:${JSON.stringify(report.bonds.ratingDistribution)}, backgroundColor:[GOLD,'rgba(184,134,11,.6)',LIGHT_GREEN,GREEN], borderRadius:4 }]`,
  'rating chart',
);

await fs.mkdir(path.dirname(outputPath), {recursive: true});
await fs.writeFile(outputPath, html, 'utf8');
console.log(`Built ${path.relative(process.cwd(), outputPath)}`);
