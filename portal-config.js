// P&J Compound Company Limited — Portal Content Configuration
// Workflow: admin.html → 儲存並套用 → 匯出 portal-config.js → replace this file → git push
localStorage.setItem('pj_compound_config_published', JSON.stringify({
  "_savedAt": "2026-05-31T00:00:00.000Z",
  "monthlyReports": [
    {
      "key": "202604",
      "label": "2026 年 04 月",
      "src": "./2026_04/202604_Monthly_Report.html"
    }
  ],
  "topics": [],
  "categories": [
    { "key": "cat-macro", "name": "總體經濟分析" },
    { "key": "cat-market", "name": "市場動態解讀" }
  ],
  "clients": [
    {
      "key": "client-philip",
      "name": "PHILIP",
      "passwordHash": "",
      "active": true,
      "order": 1,
      "note": ""
    }
  ]
}));
