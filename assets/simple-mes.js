(function () {
  const DEFAULT_BREAK_HOURS = 1;
  const DEFAULT_BREAK_MS = DEFAULT_BREAK_HOURS * 60 * 60 * 1000;
  const FIXED_BREAK_WINDOWS = [
    { startHour: 10, startMinute: 0, endHour: 10, endMinute: 15 },
    { startHour: 12, startMinute: 0, endHour: 13, endMinute: 0 },
    { startHour: 15, startMinute: 0, endHour: 15, endMinute: 15 },
  ];
  const DEFAULT_MACHINE_AVAILABLE_HOURS = 8;
  const DEFAULT_MACHINE_AVAILABLE_MS = DEFAULT_MACHINE_AVAILABLE_HOURS * 60 * 60 * 1000;
  const MAX_UNFINISHED_MS = 30 * 24 * 60 * 60 * 1000;
  const RAW_REPORTING_PAGE_SIZE = 100;
  const KEEP_HOLIDAY_STATUSES = new Set(["Start", "Resume", "End"]);
  const NATIONAL_HOLIDAYS = new Set([]);
  const MACHINE_MASTER_STORAGE_KEY = "mes_machine_master_v1";
  const SETUP_CALENDAR_STORAGE_KEY = "mes_setup_calendar_v1";
  const SETUP_CALENDAR_BACKUP_KEY = "mes_setup_calendar_backup_v1";
  const SETUP_REVIEW_STORAGE_KEY = "mes_setup_reviews_v1";
  const SETUP_REVIEW_BACKUP_KEY = "mes_setup_reviews_backup_v1";
  const PRODUCT_CLASSIFICATION_STORAGE_KEY = "mes_product_classification_v1";
  const SETUP_SHORT_REASON = "疑似僅為報工切換時間（小於 2 分鐘）";
  const SETUP_REVIEW_STATUSES = { pending: "待確認", confirmed_setup: "現場確認換模", confirmed_no_setup: "現場確認無需換模", possibly_in_processing: "可能已包含加工工時" };
  const SETUP_UNREPORTED_STATUSES = { unknown: "尚未確認", confirmed_other_order: "確認中間有其他未報工製令單", confirmed_no_other_order: "確認沒有其他未報工製令單", unable_to_confirm: "無法確認" };
  const SETUP_ATTRIBUTIONS = { unknown: "尚未確認", outside_processing: "獨立於加工工時之外（經現場確認）", inside_processing: "已包含在加工工時內（經現場確認）" };
  const MISSED_PAUSE_THRESHOLD_MS = 12 * 60 * 60 * 1000;
  const MISSED_PAUSE_INCLUDED_MACHINE_IDS = new Set([
    "L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8", "L9", "L10", "L11",
    "M1", "M2", "M5", "YC-1",
    "D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10", "D11", "D12", "D13", "D14", "D15", "D16",
    "R2-1", "HM1", "SM1", "P1", "HTRM1",
  ]);
  const MISSED_PAUSE_EXCLUDED_MACHINE_IDS = new Set([
    "YC-2", "ACME", "YH-28L", "VYURN-26", "AWEA BM 1600", "CHM4020NC", "CHM 4020 NC",
  ]);
  const FIXED_MACHINE_MASTER_SOURCE = `
YC-2｜CNC立式車床
ACME｜CNC立式車床
YC-1｜龍門铣床
D1｜懸臂鑽床D1
D2｜懸臂鑽床D2
D3｜懸臂鑽床D3
L11｜傳統立式車床
D4(原L16改)｜鑽床-大
D5(原L15改)｜鑽床-大
D6(原L14改)｜鑽床-大
D7(原L13改)｜鑽床-小
D8(原L12改)｜鑽床-小
D9｜鑽床-小
D10｜鑽床-小(原技術課)
D11｜鑽床-小(原技術課)
D12｜鑽床-小(原技術課)
D13｜未分類
D14｜鑽床-小(切試棒用)
D15｜鑽床-小
D16｜鑽床-小
HTRM1｜傳統滾牙機
SM1｜傳統插床
SM2｜傳統插床SM2
M1(原L19改)｜傳統銑床-大
M2(原L18改)｜傳統銑床-大
M5｜傳統銑床-大 (原佳佐廠)
P1｜傳統刨床
DW-68AC｜CNC線割機
YH-28L｜CNC大型車床
VYURN-26｜CNC小型車床1
YTURN-20｜CNC小型車床2
YB-63LL(無)｜CNC車床
AWEA BM 1600｜CNC铣床
CHM 4020 NC｜CNC 龍門銑床
R2-1｜CNC 搪孔複合機R2-東
R2-2｜CNC 搪孔複合機R2-西
HM1｜傳統臥式铣床HM1
L1｜傳統車床-加高L1
L2｜傳統車床L2
L3｜傳統車床L3
L4｜傳統車床L4
L5｜傳統車床L5
L6｜傳統車床L6
L7｜傳統車床L7
L8｜傳統車床L8
L9｜傳統車床L9
L10｜傳統車床L10
DW-810｜CNC線割機
  `;

  const state = {
    sourceLabel: "",
    rawRows: [],
    productClassification: { aliases: new Map(), pairs: [] },
    productClassificationExclusions: new Set(),
    rawReportingFilters: { searchTerm: "", actionStatus: "all", page: 1 },
    setupCalendar: { holidays: [], machineDaysOff: [], confirmed: false, workIntervals: [[480, 1020]], breakIntervals: [[600, 615], [720, 780], [900, 915]], attendance: [], operatorOverrides: [], machineOverrides: [], officialYears: {} },
    setupAnalysisCache: null,
    setupSearchTerm: "",
    setupPage: 1,
    setupReviews: new Map(),
    setupManualEstimates: new Map(),
    setupManualGroupKey: "",
    setupReviewPage: 1,
    setupReviewSampleKey: "",
    setupUnreportedCache: null,
    setupUnreportedFilter: "attention",
    setupUnreportedPage: 1,
    latestOperatorRecords: new Map(),
    validRecords: [],
    invalidRecords: [],
    archiveData: {
      activeRecords: [],
      archivedByYear: {},
      archivedOrdersByYear: {},
      archiveSummary: [],
    },
    selectedArchiveYear: "",
    includeArchiveInAnalysis: false,
    searchTerm: "",
    productFlowSearchTerm: "",
    selectedOperator: "",
    missedPauseFocusWorkOrderNo: "",
    machineMaster: loadMachineMaster(),
    statusFilter: "all",
    dateFilter: {
      preset: "all",
      startDate: "",
      endDate: "",
    },
    partSummaryEnabled: true,
    utilizationConfig: {
      dailyHours: DEFAULT_MACHINE_AVAILABLE_HOURS,
      excludeHolidays: true,
    },
    rangeCache: new Map(),
    message: "",
    messageType: "info",
  };

  const FIELD_MAP = {
    operator: ["使用者", "操作者", "operator"],
    machineId: ["設備編號", "機台編號", "machineid", "machine_id"],
    machineName: ["設備名稱", "機台名稱", "machinename", "machine_name"],
    workOrderNo: ["製令單號", "工單號", "workorderno", "work_order_no"],
    parentItemNo: ["母件編號", "parentitemno", "parent_item_no"],
    requiredItem: ["需求料件", "requireditem", "required_item"],
    productSpec: ["品名規格", "productspec", "product_spec"],
    quantity: ["生產數量", "數量", "quantity", "qty"],
    unit: ["單位", "unit", "uom", "qtyunit", "quantityunit", "quantity_unit"],
    actionStatus: ["動作狀態", "狀態", "status", "actionstatus", "action_status"],
    recordedAt: ["紀錄時間", "記錄時間", "recordedat", "recorded_at"],
    waitingHours: ["等待工時", "waitinghours", "waiting_hours"],
    currentWorkHours: ["本次工時", "currentworkhours", "current_work_hours"],
    totalWorkHours: ["總累計工時", "totalworkhours", "total_work_hours"],
    totalTimeWithAllowance: ["總時間(含寬放1.3)", "總時間含寬放1.3", "totaltimewithallowance", "total_time_with_allowance"],
  };

  const QUICK_RANGES = [
    { key: "yesterday", label: "昨天" },
    { key: "today", label: "今天" },
    { key: "week", label: "本週" },
    { key: "month", label: "本月" },
    { key: "firstHalf", label: "上半年" },
    { key: "secondHalf", label: "下半年" },
    { key: "all", label: "全部" },
    { key: "custom", label: "自訂日期" },
  ];

  const root = document.getElementById("root");
  if (!root) {
    return;
  }

  let googleSheetsSync = null;
  let manualImportVersion = 0;
  renderShell();
  bindEvents();
  restoreSetupCalendar();
  restoreSetupReviews();
  restoreProductClassification();
  renderAll();

  initializeGoogleSheetsSync();

  function renderShell() {
    root.innerHTML = `
      <div class="mes-page-layout" id="mesTopAnchor">
        <button id="navToggleBtn" class="mobile-nav-toggle" type="button">☰ MES分析目錄</button>
        <aside class="mes-sidebar" id="mesSidebar">
          <div class="mes-sidebar-card">
            <div class="mes-sidebar-title">📊 MES分析目錄</div>
            <nav class="mes-sidebar-nav" id="analysisDirectoryNav"></nav>
          </div>
        </aside>
        <div class="mes-shell">
        <section class="hero-panel">
          <div class="hero-top">
            <div>
              <div class="eyebrow">Simplified MES Dashboard</div>
              <h1>簡化版 MES 工時整理與排程預估</h1>
              <p>
                只保留三個核心輸出：製令單流程表、品名規格 Lead Time 表、排程預估表。系統會依照製令單號整理每站加工與等待，只有最後有 End 的製令單才納入品名規格 Lead Time 分析。
              </p>
            </div>
            <div class="chip pending">固定版持續更新</div>
          </div>
          <div class="hero-rules">
            <div class="rule-card">
              <strong>第一站加工</strong>
              <span>Start → Pause = 第一站加工工時</span>
            </div>
            <div class="rule-card">
              <strong>中間站加工</strong>
              <span>Resume → Pause = 中間站加工工時</span>
            </div>
            <div class="rule-card">
              <strong>站間等待</strong>
              <span>只有不同機台之間，上一站結束到下一站開始才算等待。</span>
            </div>
            <div class="rule-card">
              <strong>完成判斷</strong>
              <span>最後一站必須有 End，整張製令單才算完成。</span>
            </div>
          </div>
        </section>

        <section class="panel section-block search-panel">
          <div class="section-title">
            <div>
              <h3>搜尋與篩選</h3>
              <p>可搜尋製令單號、品名規格、母件編號、需求料件、機台名稱與機台代號，並同步影響流程表、品名規格 Lead Time 表與排程預估表。</p>
            </div>
          </div>
          <div class="search-grid">
            <div class="search-box">
              <label for="searchInput">搜尋關鍵字</label>
              <div class="search-input-row">
                <input id="searchInput" class="search-input" type="text" placeholder="搜尋製令單號、品名規格、母件編號、需求料件、L3、傳統車床..." />
                <button id="clearSearchBtn" class="btn-secondary" type="button">清除搜尋</button>
              </div>
            </div>
            <div class="search-box">
              <label>完成狀態篩選</label>
              <div class="filter-chip-row" id="statusFilterGroup">
                <button class="filter-btn is-active" type="button" data-status-filter="all">全部資料</button>
                <button class="filter-btn" type="button" data-status-filter="completed">只看已完成</button>
                <button class="filter-btn" type="button" data-status-filter="incomplete">只看未完成</button>
                <button class="filter-btn" type="button" data-status-filter="anomaly">只看異常資料</button>
              </div>
            </div>
          </div>
          <div id="filterResultNote" class="filter-result-note"></div>
        </section>

        <section class="panel section-block">
          <div class="section-title">
            <div>
              <h3>時間區間與匯出</h3>
              <p>可快速切換昨天、今天、本週、本月、上半年、下半年、全部或自訂日期，並依目前區間重新統計 KPI、等待分析與匯出報表。</p>
            </div>
          </div>
          <div class="range-panel">
            <div class="filter-chip-row" id="rangePresetGroup">
              ${QUICK_RANGES.map(
                (item) => `<button class="filter-btn ${item.key === "all" ? "is-active" : ""}" type="button" data-range-preset="${item.key}">${item.label}</button>`
              ).join("")}
            </div>
            <div class="range-control-grid">
              <div class="field-box compact">
                <label for="rangeStartInput">開始日期</label>
                <input id="rangeStartInput" class="search-input" type="date" />
              </div>
              <div class="field-box compact">
                <label for="rangeEndInput">結束日期</label>
                <input id="rangeEndInput" class="search-input" type="date" />
              </div>
              <div class="range-action-box">
                <button id="applyRangeBtn" class="btn-primary" type="button">套用查詢</button>
                <button id="clearRangeBtn" class="btn-secondary" type="button">清除查詢</button>
              </div>
            </div>
            <div id="rangeLabel" class="range-label">目前查詢區間：全部</div>
            <div class="range-control-grid">
              <div class="field-box compact">
                <label for="shiftHoursSelect">每日可用工時</label>
                <select id="shiftHoursSelect" class="search-input">
                  <option value="8" selected>8 小時</option>
                  <option value="10">10 小時</option>
                  <option value="12">12 小時</option>
                </select>
              </div>
              <div class="field-box compact">
                <label for="excludeHolidayToggle">假日設定</label>
                <div class="checkbox-row">
                  <input id="excludeHolidayToggle" type="checkbox" checked />
                  <span>排除未開工假日</span>
                </div>
              </div>
              <div class="field-box compact">
                <label for="partSummaryToggle">Excel 匯出設定</label>
                <div class="checkbox-row">
                  <input id="partSummaryToggle" type="checkbox" checked />
                  <span>相同料件自動彙整</span>
                </div>
              </div>
            </div>
            <div class="export-row">
              <button id="exportCurrentBtn" class="btn-secondary" type="button">匯出目前區間</button>
              <button id="exportFirstHalfBtn" class="btn-secondary" type="button">匯出上半年</button>
              <button id="exportSecondHalfBtn" class="btn-secondary" type="button">匯出下半年</button>
              <button id="exportFullBtn" class="btn-secondary" type="button">匯出全部</button>
              <button id="exportAllAnalysisBtn" class="btn-primary" type="button">匯出全部分析報表</button>
            </div>
          </div>
        </section>

        <section class="panel google-sync-panel" aria-labelledby="google-sync-heading">
          <h2 id="google-sync-heading">Google Sheets 加工紀錄同步</h2>
          <p class="panel-note">只讀取「加工紀錄表」，成功後取代目前資料，不追加或回寫 Google Sheets。仍可手動匯入 Excel。</p>
          <div class="action-row">
            <button id="googleAuthorizeBtn" class="btn-primary" type="button">Google 授權</button>
            <button id="googleSyncBtn" class="btn-secondary" type="button" disabled>重新同步</button>
            <button id="googleDisconnectBtn" class="btn-secondary" type="button">清除本頁授權／取消同步</button>
          </div>
          <p id="googleSyncStatus" role="status" aria-live="polite">等待 Google 授權</p>
          <p id="googleSyncMeta" class="panel-note">最後成功同步：尚未同步｜上次成功讀取原始紀錄：—</p>
          <p id="googleSyncError" class="google-sync-error" role="alert" hidden></p>
          <details><summary>授權與資料安全說明</summary><p class="panel-note">授權權杖只留在本頁記憶體，重新整理可能需要再次授權。不保存密碼或長期權杖。唯讀權限不是分頁隔離權限，但本程式只請求指定加工紀錄表。請使用有試算表讀取權限的帳號。加工紀錄不會上傳 GitHub。同步使用台灣時間，請將電腦時區設為台北；本機 file:// 不支援 Google 授權，Excel 功能不受影響。</p></details>
        </section>

        <div class="grid-2">
          <section class="panel">
            <h2>上傳 Excel / CSV</h2>
            <p class="panel-note">支援 .xlsx、.xls、.csv。若有工作表「加工紀錄表」會優先使用；若只有一個工作表，會直接使用該工作表。</p>
            <div class="control-grid single-column">
              <div class="field-box">
                <label for="excelInput">選擇資料檔案</label>
                <input id="excelInput" class="file-input" type="file" accept=".xlsx,.xls,.csv" />
                <div class="foot-note">匯入後會直接依製令單號整理流程，並產生品名規格 Lead Time 表與排程預估。</div>
              </div>
            </div>
          </section>

          <section class="panel">
            <h2>貼上資料</h2>
            <p class="panel-note">直接貼上含標題列的 TSV / tab 分隔資料，按下「開始分析」即可產生相同三張表。</p>
            <div class="paste-box">
              <div class="field-box">
                <label for="pasteInput">貼上 TSV / tab 資料</label>
                <textarea id="pasteInput" class="text-input" placeholder="使用者	設備編號	設備名稱	製令單號	母件編號	需求料件	品名規格	生產數量	動作狀態	紀錄時間"></textarea>
                <div class="action-row">
                  <button id="analyzeTextBtn" class="btn-primary" type="button">開始分析</button>
                  <button id="clearTextBtn" class="btn-secondary" type="button">清空貼上內容</button>
                </div>
              </div>
            </div>
          </section>
        </div>

        <section class="panel section-block" id="kpi-overview">
          <div class="section-title">
            <div>
              <h3>資料摘要</h3>
              <p>整理目前資料來源、機台啟停原始筆數、機台啟停有效筆數、已完成製令單、異常筆數與目前畫面顯示數量。</p>
            </div>
          </div>
          <div id="summaryGrid" class="summary-grid"></div>
          <div id="messageBox" class="message-box" style="display:none"></div>
        </section>

        <details class="panel section-block invalid-records-panel" id="invalid-records-details">
          <summary><h3>無效資料明細</h3></summary>
          <p class="panel-note">顯示本次匯入的全部無效資料，與 KPI 筆數一致，不受日期、搜尋或工單狀態篩選影響。</p>
          <div id="invalidRecordsTable"></div>
        </details>

        <section class="panel section-block" id="raw-reporting-records">
          <div class="section-title">
            <div>
              <h3 id="raw-reporting-heading">原始報工紀錄</h3>
              <p>逐筆顯示目前匯入的全部原始報工事件，包含未完成、已歸檔與無效資料；不合併事件、不重新計算工時，也不受上方分析篩選影響。</p>
            </div>
          </div>
          <div class="search-grid">
            <div class="search-box">
              <label for="rawReportingSearchInput">搜尋製令單號 / 設備編號 / 品名規格 / 使用者</label>
              <input id="rawReportingSearchInput" class="search-input" type="search" placeholder="輸入製令單號、設備編號、品名規格或使用者" />
            </div>
            <div class="search-box">
              <label for="rawReportingStatusSelect">動作狀態</label>
              <select id="rawReportingStatusSelect" class="search-input">
                <option value="all">全部</option>
                <option value="Start">Start / 開始</option>
                <option value="Pause">Pause / 暫停</option>
                <option value="Resume">Resume / 恢復</option>
                <option value="End">End / 結束</option>
              </select>
            </div>
          </div>
          <div class="action-row">
            <button id="clearRawReportingFiltersBtn" class="btn-secondary" type="button">清除原始紀錄篩選</button>
            <button id="exportRawReportingBtn" class="btn-primary" type="button">匯出原始報工紀錄</button>
          </div>
          <p class="panel-note">搜尋與動作篩選只影響此表。匯出包含全部原始紀錄（不限篩選結果或本頁），與總匯出的「原始報工紀錄」工作表一致。</p>
          <div id="rawReportingResultNote" class="filter-result-note" role="status" aria-live="polite"></div>
          <div id="rawReportingTable"></div>
          <div id="rawReportingPagination" class="action-row raw-reporting-pagination" aria-label="原始報工紀錄分頁" hidden>
            <button id="rawReportingPrevBtn" class="btn-secondary" type="button">上一頁</button>
            <span id="rawReportingPageLabel"></span>
            <button id="rawReportingNextBtn" class="btn-secondary" type="button">下一頁</button>
          </div>
        </section>

        <section class="panel section-block" id="historical-setup-analysis">
          <div class="section-title">
            <div>
              <h3 id="historical-setup-heading">歷史推估換模時間分析</h3>
              <p>僅依全部原始報工事件建立換模候選，不是正式量測換模時間；不使用 End 作為起點，不回寫 MES 工時或 APS 排程。</p>
            </div>
          </div>
          <details class="setup-method-panel">
            <summary>判定規則、行事曆與推估來源</summary>
            <p>依原始時間排序，以同機台不同製令單切換配對：前段最後 Pause → 後段第一筆 Start / Resume，Resume 不要求前面另有 Start。同工單續工不建立候選；End 完全不參與切換配對。前工單又回站標示「交錯加工／待確認」；缺少 Pause 不強行推算，重複、缺漏與重疊事件另列待確認。</p>
            <p>預設工作時段 08:00–17:00，扣除 10:00–10:15、12:00–13:00、15:00–15:15。使用人事行政總處年度日曆（含補假），週日固定休息；週六須有個別出勤或人工指定時段，僅有 MES 報工不推定整天上班。未取得完整年度資料時標示「日曆資料未確認」。跨日候選保留調整後時間，但仍不進代表值；小於 2 分鐘標示「疑似僅為報工切換時間」。</p>
            <p>既有 IQR 與最終採用資格不變，不因調整估算門檻重新納入排除資料。只從最終採用樣本分級：產品 1–2 筆「小樣本暫估」、3–4 筆「中等樣本」、5 筆以上「樣本相對充足」，均以產品候選中位數作為 product_transition。摘要以 1 筆顯示「小樣本暫估」、2 筆以上顯示「多筆中位數」，詳細樣本等級保留。產品 0 筆才參考同機台其他有效切換的 machine_default；機台也無有效樣本且非可能不需換模時，顯示「需人工暫估」，可另存參考分鐘。人工值標示 manual_estimate，不填入歷史中位數、不增加樣本。產品中位數與機台參考分開呈現，所有數值都是候選推估，不是實測標準。目前不使用或猜測閥類層。</p>
            <p>前後需求料件非空且相同，即標記「可能不需換模」，不要求品名文字相同。保留候選及原始／調整後分鐘，不設為 0，也不納入代表值。含這類候選的產品組合不套用機台參考值；若有其他不同料件的最終有效產品樣本，產品參考僅適用那些不同料件候選。僅有短時間候選時，機台值只供比較，不得拿來放大短空檔。</p>
            <p>樣本數等級、A／B／C 與日曆確認狀態分開顯示，樣本多不等於真實換模已確認。平均值只供比較。A 同一人且期間未見他機報工；B 不同人接手；C 同一人但期間有他機報工。人工覆核與換模時間歸屬獨立保存，不會自動採用排除候選或改動工時；未取得現場佐證前，不可判斷換模在加工工時之內或之外，也不可直接加入 APS 排程。</p>
            <p>他機報工檢查前後操作員的 Start / Pause / Resume，並列出可配對 Start / Resume → Pause 與候選的重疊區間（含跨越候選兩端的區間）。重疊分鐘以區間聯集計算，並非操作員實際停留或換模時間，不從候選時間扣除。B 不同人接手優先於 C；B 的工作時段採兩人日曆交集。操作員行為可信度與日曆確認狀態分開判斷，A 類不代表整體換模時間已核實。</p>
            <p>日曆確認狀態：已確認＝相關工作日有實際人員出勤及必要機台時段；預設班別推估＝平日缺出勤表，依預設班別及休息計算；待確認＝週六時段不明、年度日曆缺漏、僅有人工出勤例外，或已有出勤但缺必要機台資料。此狀態只補充佐證說明，不改變候選分鐘、採用條件及中位數。官方休息日依既有規則扣除，不等同核實人員出勤。</p>
            <p>移往下一站的佐證：前工單在 Pause 之後、後工單開工之前，已於另一台機台 Start / Resume。最終採用沿用原有資格流程（含產品層及機台層 IQR）；分級估算是資格判定後的獨立步驟，不會改變原有排除原因。退回來源的樣本數另列。</p>
            <div class="search-grid">
              <div class="search-box">
                <label for="setupHolidayInput">額外全廠休息日（每行 YYYY-MM-DD）</label>
                <textarea id="setupHolidayInput" class="text-input" placeholder="請填入工廠實際採用的休息日期"></textarea>
              </div>
              <div class="search-box">
                <label for="setupMachineDaysOffInput">機台非工作日（每行 設備編號,YYYY-MM-DD）</label>
                <textarea id="setupMachineDaysOffInput" class="text-input" placeholder="例如 L3,2026-01-01"></textarea>
              </div>
            </div>
            <p class="panel-note">預載 2025–2027 完整年度官方日曆；政府機關日曆為參考，不等同工廠實際出勤。<a href="https://data.gov.tw/dataset/14718" target="_blank" rel="noopener">官方年度 CSV 來源</a>。未來年度請匯入完整年度 CSV，不使用固定節日推算。</p>
            <div class="search-grid">
              <div class="search-box"><label for="setupOfficialCalendarFile">匯入人事行政總處完整年度 CSV（西元日期、是否放假、備註）</label><input id="setupOfficialCalendarFile" type="file" accept=".csv" /></div>
              <div class="search-box"><label for="setupWorkIntervals">預設工作時段（多段以分號分隔）</label><input id="setupWorkIntervals" class="text-input" value="08:00-17:00" /></div>
              <div class="search-box"><label for="setupBreakIntervals">休息時段（可清空）</label><input id="setupBreakIntervals" class="text-input" value="10:00-10:15;12:00-13:00;15:00-15:15" /></div>
              <div class="search-box"><label for="setupAttendanceInput">實際出勤（每行 日期,人員,時段；無出勤填 休）</label><textarea id="setupAttendanceInput" class="text-input" placeholder="2026-05-09,王員工,08:00-12:00;13:00-18:00"></textarea></div>
              <div class="search-box"><label for="setupOperatorOverrides">人工出勤例外（格式同上；* 表示全體，實際出勤優先）</label><textarea id="setupOperatorOverrides" class="text-input" placeholder="2026-05-01,王員工,08:00-12:00"></textarea></div>
              <div class="search-box"><label for="setupMachineOverrides">機台工作時段（每行 日期,機台,時段；休 表示停工）</label><textarea id="setupMachineOverrides" class="text-input" placeholder="2026-05-09,L3,08:00-12:00"></textarea></div>
            </div>
            <label class="checkbox-row"><input id="setupCalendarConfirmed" type="checkbox" />已核對工廠／機台非工作日。此勾選不會補齊未知年度或週六出勤資料。</label>
            <div class="action-row">
              <button id="applySetupCalendarBtn" class="btn-secondary" type="button">套用並保存換模行事曆</button>
              <button id="exportSetupCalendarBtn" class="btn-secondary" type="button">匯出設定備份（JSON）</button>
              <button id="restoreSetupCalendarBackupBtn" class="btn-secondary" type="button">還原上一版設定</button>
            </div>
            <label for="importSetupCalendarFile">匯入設定備份（JSON）</label><input id="importSetupCalendarFile" type="file" accept=".json,application/json" />
            <p class="panel-note">設定僅影響換模分析，保存於目前瀏覽器 LocalStorage，重新整理會還原；每次保存保留上一版。換電腦、換網址或清除瀏覽器資料前，請先匯出 JSON 備份；備份可能含人員姓名，請妥善保管。匯出的是已套用設定，未套用的輸入請先保存。不修改原本 MES 假日設定。</p>
            <div id="setupCalendarMessage" role="status" aria-live="polite"></div>
          </details>
          <div class="search-grid">
            <div class="search-box"><label for="setupSearchInput">搜尋機台 / 前後產品 / 製令單</label><input id="setupSearchInput" class="search-input" type="search" placeholder="搜尋換模候選" /></div>
            <div class="search-box"><label>分析匯出</label><button id="exportSetupAnalysisBtn" class="btn-primary" type="button">匯出換模分析</button><p class="panel-note">匯出全部換模彙總及候選明細，不限搜尋結果。</p></div>
          </div>
          <p class="panel-note">以下為換模候選估算，並非已確認的真實換模工時。有效樣本數為本產品組合採用筆數；機台參考使用的樣本數另列於詳細資訊。是否已包含加工工時仍須現場確認，不自動加入加工或 APS 排程。</p>
          <h4>產品切換換模參考</h4>
          <div id="setupAnalysisTable"></div>
          <div id="setupAnalysisPagination" class="action-row setup-analysis-pagination" hidden>
            <button id="setupPrevBtn" class="btn-secondary" type="button">上一頁</button><span id="setupPageLabel"></span><button id="setupNextBtn" class="btn-secondary" type="button">下一頁</button>
          </div>
          <details id="setupManualEditor" class="setup-method-panel">
            <summary>人工暫估設定（僅限無歷史參考組合）</summary>
            <p id="setupManualContext">請從無歷史參考的產品組合點選「輸入人工暫估」。</p>
            <div class="search-grid">
              <div class="search-box"><label for="setupManualMinutes">人工參考分鐘數</label><input id="setupManualMinutes" class="text-input" type="number" min="0" step="any" placeholder="輸入大於 0 的參考分鐘；留空可清除" /></div>
              <div class="search-box"><label for="setupManualNote">暫估依據／登錄人（選填）</label><textarea id="setupManualNote" class="text-input" maxlength="2000"></textarea></div>
            </div>
            <button id="saveSetupManualBtn" class="btn-primary" type="button" disabled>保存人工暫估</button>
            <p class="panel-note">人工值不是歷史中位數，不增加樣本數。未來有產品或機台有效歷史資料時，優先顯示歷史估算，保留人工設定供查閱。可能不需換模者不套用人工值。歸屬預設尚未確認，仍須在候選明細另行覆核。與人工覆核共用下方 JSON 備份。</p>
            <div id="setupManualMessage" role="status" aria-live="polite"></div>
          </details>
          <details class="setup-method-panel"><summary>分析筆數、日曆狀態與各機台詳細統計</summary>
            <div id="setupAnalysisDiagnostics" class="summary-grid"></div>
            <p id="setupAnalysisNote" class="filter-result-note" role="status"></p>
            <h4>各機台換模候選與人員條件</h4>
            <div id="setupMachineAnalysisTable"></div>
          </details>
          <details class="setup-method-panel"><summary>無法配對／原始事件待確認明細</summary><div id="setupPairingIssues"></div></details>
          <details id="setupShortReviewPanel" class="setup-method-panel"><summary>短時間候選待覆核清單</summary>
          <h3 id="setup-short-review-heading">短時間候選待覆核</h3>
          <p class="panel-note">只列出唯一排除原因為小於 2 分鐘的候選，仍維持正式排除。短空檔可能內含換模／待現場確認，不代表漏刷，也不自動補成機台中位數。此清單使用全部原始資料，不受產品搜尋影響。</p>
          <div id="setupShortReviewTable"></div>
          <div id="setupReviewPagination" class="action-row" hidden><button id="setupReviewPrevBtn" class="btn-secondary" type="button">上一頁待覆核</button><span id="setupReviewPageLabel"></span><button id="setupReviewNextBtn" class="btn-secondary" type="button">下一頁待覆核</button></div>
          </details>
          <details id="setupReviewEditor" class="setup-method-panel">
            <summary>人工覆核與換模時間歸屬</summary>
            <p id="setupReviewContext">請從短時間清單或任一產品候選明細點選「覆核」。</p>
            <div class="search-grid">
              <div class="search-box"><label for="setupReviewStatus">現場覆核狀態</label><select id="setupReviewStatus" class="text-input">${Object.entries(SETUP_REVIEW_STATUSES).map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></div>
              <div class="search-box"><label for="setupReviewAttribution">換模時間歸屬</label><select id="setupReviewAttribution" class="text-input">${Object.entries(SETUP_ATTRIBUTIONS).map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></div>
              <div class="search-box"><label for="setupReviewNote">覆核人／現場佐證備註（選填）</label><textarea id="setupReviewNote" class="text-input" maxlength="2000"></textarea></div>
              <div class="search-box"><label for="setupUnreportedStatus">中間是否有其他未報工製令單</label><select id="setupUnreportedStatus" class="text-input">${Object.entries(SETUP_UNREPORTED_STATUSES).map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></div>
              <div class="search-box"><label for="setupUnreportedNote">未報工確認備註／現場佐證（選填）</label><textarea id="setupUnreportedNote" class="text-input" maxlength="2000"></textarea></div>
            </div>
            <button id="saveSetupReviewBtn" class="btn-primary" type="button" disabled>保存本筆人工覆核</button>
            <p class="panel-note">僅保存人工紀錄，不會改變採用、排除或中位數。兩種狀態分開選擇；「可能已包含」不等於「經現場確認已包含」。請保存後再切換候選。已包含加工工時者不得重複加計；尚未確認者不得自動外加換模時間。</p>
            <p class="panel-note">未報工確認與換模覆核、時間歸屬各自獨立。確認有其他未報工工單時，不宜將整段空檔直接當換模時間；不設為 0、不推算或扣除未報工工時，保存後僅列出引用範圍。</p>
            <div id="setupUnreportedImpact" role="status" aria-live="polite"></div>
          </details>
          <details id="setupUnreportedPanel" class="setup-method-panel">
            <summary>未報工製令單風險待覆核</summary>
            <h3 id="setup-unreported-heading">未報工製令單風險待覆核</h3>
            <p class="panel-note">以同機台最終採用且不同產品的候選為歷史池。至少 5 筆時計算 Q3＋1.5×IQR；同日、調整後分鐘大於 0 且超過門檻才提醒。使用未四捨五入值比較，不設定固定分鐘上限。跨日、非正時間另列待確認；樣本不足不套統計門檻。</p>
            <p class="panel-note">長空檔僅值得覆核，不表示確有未報工製令單。即使 A 類或未觸發提醒，也不能證明中間沒有其他工作。此提示不改變正式採用／排除，不把原始空檔與調整後分鐘混用。Excel 風險工作表列出全部候選，不受下列篩選影響。</p>
            <label for="setupUnreportedFilter">顯示範圍</label><select id="setupUnreportedFilter" class="text-input"><option value="attention">長空檔提醒／已登錄確認</option><option value="insufficient">樣本不足，無法自動判定</option><option value="all">全部候選風險資料</option></select>
            <p id="setupUnreportedCount" class="filter-result-note"></p>
            <div id="setupUnreportedTable"></div>
            <div id="setupUnreportedPagination" class="action-row" hidden><button id="setupUnreportedPrevBtn" class="btn-secondary" type="button">上一頁</button><span id="setupUnreportedPageLabel"></span><button id="setupUnreportedNextBtn" class="btn-secondary" type="button">下一頁</button></div>
          </details>
          <div class="action-row"><button id="exportSetupReviewsBtn" class="btn-secondary" type="button">匯出人工覆核與暫估備份（JSON）</button><button id="restoreSetupReviewsBackupBtn" class="btn-secondary" type="button">還原上一版人工設定</button></div>
          <label for="importSetupReviewsFile">匯入人工覆核與暫估備份（JSON）</label><input id="importSetupReviewsFile" type="file" accept=".json,application/json" />
          <p class="panel-note">人工資料保存於目前瀏覽器，保存時保留上一版；請另匯出 JSON 備份以便換電腦或清除瀏覽器後還原。匯入會保留其他紀錄，相同事件的覆核、相同機台與前後產品的暫估以匯入版本取代，需確認後才套用。事件以機台、工單、產品、操作員與原始時間識別，不以 Excel 列號識別。新版 JSON 同時保存人工覆核與暫估，仍可匯入舊版純覆核備份。備份含人員資訊，請妥善保管。</p>
          <div id="setupReviewsMessage" role="status" aria-live="polite"></div>
        </section>

        <section class="panel section-block" id="archive-analysis">
          <div class="section-title">
            <div>
              <h3>歷史資料年度歸檔</h3>
              <p>已完成 / 已結案的製令單會依最後一筆有效 End 的年度歸檔保存；主畫面預設只分析未結案主資料，需要時可把指定年度歷史資料一起帶入分析。</p>
            </div>
          </div>
          <div id="archiveSection"></div>
        </section>

        <section class="panel section-block" id="workorder-analysis">
          <div class="section-title">
            <div>
              <h3>製令單流程表</h3>
              <p>依製令單號顯示品名規格、機台流程、每站加工時間、每站後等待時間與是否完成。</p>
            </div>
          </div>
          <div id="flowTable"></div>
        </section>

        <section class="panel section-block" id="standard-time-analysis">
          <div class="section-title">
            <div>
              <h3>品名規格 Lead Time 表</h3>
              <p>只統計最後有 End 的完成製令單，依品名規格計算平均加工、等待、Lead Time 與建議排程 Lead Time。</p>
            </div>
          </div>
          <div id="standardTable"></div>
        </section>

        <section class="panel section-block" id="schedule-estimation">
          <div class="section-title">
            <div>
              <h3>排程預估表</h3>
              <p>新製令單或未完成製令單會先看品名規格是否已有 Lead Time 基準；若沒有，標記需要人工估時。</p>
            </div>
          </div>
          <div id="scheduleTable"></div>
        </section>

        <section class="panel section-block" id="waiting-analysis">
          <div class="section-title">
            <div>
              <h3>等待時間與機台利用率分析</h3>
              <p>聚焦跨機台的站間等待，以及各機台在目前查詢區間內的可用工時與利用率。</p>
            </div>
          </div>
          <div id="waitingAnalytics"></div>
        </section>

        <section class="panel section-block" id="missed-pause-analysis">
          <div class="section-title">
            <div>
              <h3>疑似漏按暫停分析表</h3>
              <p>只針對人工操作設備檢查 Start / Resume 到 Pause 是否超過 12 小時。此區僅做警示，不修改任何原始工時與 Lead Time 計算。</p>
            </div>
          </div>
          <div id="missedPauseAnalysisSection"></div>
        </section>

        <section class="panel section-block" id="machine-utilization">
          <div class="section-title">
            <div>
              <h3>加工工時占比分析</h3>
              <p>依本期間各機台實際加工工時占比，整理加工量集中程度、閒置狀態與未使用設備。機台主檔會依匯入資料自動新增，不會因本次未出現而刪除。</p>
            </div>
          </div>
          <div id="machineUsageSection"></div>
        </section>

        <section class="panel section-block" id="product-classification">
          <h3>品名規格自動歸類</h3>
          <p>只歸類原始文字完全相同、僅最後有無「-毛胚」的兩種名稱，優先使用帶「-毛胚」的名稱。只有無尾碼版本時維持原名。此設定只影響品名分析分組，不合併原始事件，不改變換模分析。</p>
          <details class="setup-method-panel">
            <summary>查看歸類對照與人工排除設定</summary>
            <p>若產品類型或加工階段不同，請取消勾選「自動歸類」。設定會保留到下次匯入；換電腦前請匯出備份。筆數為原始報工事件數，包含無效紀錄。</p>
            <div id="productClassificationTable" class="table-shell"></div>
            <div class="action-row"><button id="exportProductClassificationBtn" class="btn-secondary" type="button">匯出排除設定 JSON</button><label for="importProductClassificationFile">匯入排除設定（合併保留）</label><input id="importProductClassificationFile" type="file" accept=".json,application/json" /></div>
          </details>
          <p id="productClassificationSummary" class="panel-note"></p>
          <p id="productClassificationMessage" role="status" aria-live="polite"></p>
        </section>

        <section class="panel section-block" id="comparison-analysis">
          <div class="section-title">
            <div>
              <h3>相同品名規格工時比較</h3>
              <p>同一品名規格出現 2 張以上製令單時，會集中比較總加工工時、等待工時、Lead Time 與總時間含寬放 1.3。</p>
            </div>
          </div>
          <div id="comparisonSection"></div>
        </section>

        <section class="panel section-block" id="product-analysis">
          <div class="section-title">
            <div>
              <h3>品名規格流程分析表</h3>
              <p>依相同品名規格的歷史製令單，自動產生動態機台欄位、跨機台等待欄位、總工時、總等待時間、Lead Time 與總時間(含寬放1.3)。</p>
            </div>
          </div>
          <div class="search-grid">
            <div class="search-box">
              <label for="productFlowSearchInput">搜尋品名規格 / 製令單號</label>
              <div class="search-input-row">
                <input id="productFlowSearchInput" class="search-input" type="text" placeholder="搜尋品名規格、製令單號..." />
                <button id="clearProductFlowSearchBtn" class="btn-secondary" type="button">清除搜尋</button>
              </div>
            </div>
            <div class="search-box">
              <label>分析匯出</label>
              <div class="export-row compact-export-row">
                <button id="exportProductFlowBtn" class="btn-primary" type="button">匯出流程分析</button>
              </div>
            </div>
          </div>
          <div id="productFlowAnalysisNote" class="filter-result-note"></div>
          <div id="productFlowAnalysisSection"></div>
        </section>

        <section class="panel section-block" id="operator-analysis">
          <div class="section-title">
            <div>
              <h3>品名規格 × 人員分析</h3>
              <p>依品名規格查看有哪些人加工過、各人加工工時、加工次數、平均工時與使用機台。</p>
            </div>
          </div>
          <div id="productOperatorSection"></div>
        </section>

        <section class="panel section-block">
          <div class="section-title">
            <div>
              <h3>人員加工分析</h3>
              <p>彙整每位人員的加工總工時、加工次數、平均工時、使用機台與最近加工紀錄。</p>
            </div>
          </div>
          <div id="operatorSummarySection"></div>
        </section>

        <section class="panel section-block" id="operatorDetailAnchor">
          <div class="section-title">
            <div>
              <h3>人員詳細頁</h3>
              <p>點擊人員名稱後，可查看該人員所有加工紀錄、所有製令單、加工總工時、平均工時、使用機台、加工過的品名規格與最近加工紀錄。</p>
            </div>
          </div>
          <div id="operatorDetailSection"></div>
        </section>
        </div>
        <button id="backToTopBtn" class="back-to-top-btn" type="button">⬆ 回到頂端</button>
      </div>
    `;
  }

  function bindEvents() {
    document.getElementById("productClassificationTable").addEventListener("change", (event) => {
      const input = event.target.closest("input[data-product-base]");
      if (!input) return;
      const excluded = new Set(state.productClassificationExclusions);
      if (input.checked) excluded.delete(input.dataset.productBase);
      else excluded.add(input.dataset.productBase);
      saveProductClassification(excluded);
    });
    document.getElementById("exportProductClassificationBtn").addEventListener("click", () => {
      const data = window.MESProductClassification.exportSettings(state.productClassificationExclusions);
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url; link.download = "MES品名歸類排除設定.json"; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    document.getElementById("importProductClassificationFile").addEventListener("change", async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      try {
        const imported = window.MESProductClassification.parseSettings(await file.text());
        saveProductClassification(new Set([...state.productClassificationExclusions, ...imported]));
      } catch (error) { document.getElementById("productClassificationMessage").textContent = `匯入失敗：${error.message}`; }
      finally { event.target.value = ""; }
    });
    const excelInput = document.getElementById("excelInput");
    const analyzeTextBtn = document.getElementById("analyzeTextBtn");
    const clearTextBtn = document.getElementById("clearTextBtn");
    const pasteInput = document.getElementById("pasteInput");
    const searchInput = document.getElementById("searchInput");
    const clearSearchBtn = document.getElementById("clearSearchBtn");
    const productFlowSearchInput = document.getElementById("productFlowSearchInput");
    const clearProductFlowSearchBtn = document.getElementById("clearProductFlowSearchBtn");
    const applyRangeBtn = document.getElementById("applyRangeBtn");
    const clearRangeBtn = document.getElementById("clearRangeBtn");
    const rangeStartInput = document.getElementById("rangeStartInput");
    const rangeEndInput = document.getElementById("rangeEndInput");
    const shiftHoursSelect = document.getElementById("shiftHoursSelect");
    const excludeHolidayToggle = document.getElementById("excludeHolidayToggle");
    const partSummaryToggle = document.getElementById("partSummaryToggle");
    const navToggleBtn = document.getElementById("navToggleBtn");
    const mesSidebar = document.getElementById("mesSidebar");
    const analysisDirectoryNav = document.getElementById("analysisDirectoryNav");
    const backToTopBtn = document.getElementById("backToTopBtn");

    shiftHoursSelect.value = String(state.utilizationConfig.dailyHours);
    excludeHolidayToggle.checked = !!state.utilizationConfig.excludeHolidays;
    partSummaryToggle.checked = !!state.partSummaryEnabled;

    excelInput.addEventListener("change", async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) {
        return;
      }
      const version = ++manualImportVersion;
      googleSheetsSync?.beginManual();
      let success = false;
      try {
        ensureXlsxReady();
        const result = await parseWorkbookFile(file);
        if (version !== manualImportVersion) return;
        analyzeRows(result.rows, result.sourceLabel);
        success = true;
        setMessage(`資料檔案已完成分析：${result.sourceLabel}`, "info");
      } catch (error) {
        if (version === manualImportVersion) setMessage(error.message || "Excel 匯入失敗。", "error");
      } finally {
        if (version === manualImportVersion) googleSheetsSync?.endManual(success);
        event.target.value = "";
      }
    });

    analyzeTextBtn.addEventListener("click", () => {
      const text = pasteInput.value.trim();
      if (!text) {
        setMessage("請先貼上 TSV 或 tab 分隔資料。", "error");
        return;
      }

      manualImportVersion += 1;
      googleSheetsSync?.beginManual();
      let success = false;
      try {
        const rows = parseTabularText(text);
        analyzeRows(rows, "貼上資料");
        success = true;
        setMessage("貼上資料已完成分析。", "info");
      } catch (error) {
        setMessage(error.message || "貼上資料分析失敗。", "error");
      } finally {
        googleSheetsSync?.endManual(success);
      }
    });

    clearTextBtn.addEventListener("click", () => {
      pasteInput.value = "";
      pasteInput.focus();
    });

    searchInput.addEventListener("input", (event) => {
      state.searchTerm = event.target.value || "";
      renderAll();
    });

    clearSearchBtn.addEventListener("click", () => {
      state.searchTerm = "";
      searchInput.value = "";
      renderAll();
      searchInput.focus();
    });

    productFlowSearchInput.addEventListener("input", (event) => {
      state.productFlowSearchTerm = event.target.value || "";
      renderAll();
    });

    clearProductFlowSearchBtn.addEventListener("click", () => {
      state.productFlowSearchTerm = "";
      productFlowSearchInput.value = "";
      renderAll();
      productFlowSearchInput.focus();
    });

    document.getElementById("rawReportingSearchInput").addEventListener("input", (event) => {
      state.rawReportingFilters.searchTerm = event.target.value || "";
      state.rawReportingFilters.page = 1;
      renderRawReportingSection();
    });
    document.getElementById("rawReportingStatusSelect").addEventListener("change", (event) => {
      state.rawReportingFilters.actionStatus = event.target.value;
      state.rawReportingFilters.page = 1;
      renderRawReportingSection();
    });
    document.getElementById("clearRawReportingFiltersBtn").addEventListener("click", () => {
      state.rawReportingFilters = { searchTerm: "", actionStatus: "all", page: 1 };
      document.getElementById("rawReportingSearchInput").value = "";
      document.getElementById("rawReportingStatusSelect").value = "all";
      renderRawReportingSection();
      document.getElementById("rawReportingSearchInput").focus();
    });
    document.getElementById("rawReportingPrevBtn").addEventListener("click", () => {
      state.rawReportingFilters.page -= 1;
      renderRawReportingSection();
    });
    document.getElementById("rawReportingNextBtn").addEventListener("click", () => {
      state.rawReportingFilters.page += 1;
      renderRawReportingSection();
    });
    document.getElementById("exportRawReportingBtn").addEventListener("click", () => exportRawReportingReport());
    document.getElementById("setupSearchInput").addEventListener("input", (event) => {
      state.setupSearchTerm = event.target.value || "";
      state.setupPage = 1;
      renderHistoricalSetupSection();
    });
    document.getElementById("setupPrevBtn").addEventListener("click", () => {
      state.setupPage -= 1;
      renderHistoricalSetupSection();
    });
    document.getElementById("setupNextBtn").addEventListener("click", () => {
      state.setupPage += 1;
      renderHistoricalSetupSection();
    });
    document.getElementById("applySetupCalendarBtn").addEventListener("click", applySetupCalendar);
    document.getElementById("exportSetupCalendarBtn").addEventListener("click", exportSetupCalendarSettings);
    document.getElementById("importSetupCalendarFile").addEventListener("change", importSetupCalendarSettings);
    document.getElementById("restoreSetupCalendarBackupBtn").addEventListener("click", restoreSetupCalendarBackup);
    document.getElementById("setupOfficialCalendarFile").addEventListener("change", importSetupOfficialCalendar);
    document.getElementById("exportSetupAnalysisBtn").addEventListener("click", () => exportSetupAnalysisReport());
    document.getElementById("historical-setup-analysis").addEventListener("click", (event) => {
      const button = event.target.closest("[data-setup-review-id]");
      if (button) openSetupReviewEditor(button.dataset.setupReviewId);
      const manualButton = event.target.closest("[data-setup-manual-key]");
      if (manualButton) openSetupManualEditor(manualButton.dataset.setupManualKey);
    });
    document.getElementById("saveSetupManualBtn").addEventListener("click", saveSetupManualEstimate);
    document.getElementById("saveSetupReviewBtn").addEventListener("click", saveSetupReview);
    document.getElementById("exportSetupReviewsBtn").addEventListener("click", exportSetupReviews);
    document.getElementById("importSetupReviewsFile").addEventListener("change", importSetupReviews);
    document.getElementById("restoreSetupReviewsBackupBtn").addEventListener("click", restoreSetupReviewsBackup);
    document.getElementById("setupReviewPrevBtn").addEventListener("click", () => { state.setupReviewPage -= 1; renderSetupReviewSection(getHistoricalSetupAnalysis()); });
    document.getElementById("setupReviewNextBtn").addEventListener("click", () => { state.setupReviewPage += 1; renderSetupReviewSection(getHistoricalSetupAnalysis()); });
    document.getElementById("setupUnreportedFilter").addEventListener("change", (event) => { state.setupUnreportedFilter = event.target.value; state.setupUnreportedPage = 1; renderSetupUnreportedSection(); });
    document.getElementById("setupUnreportedPrevBtn").addEventListener("click", () => { state.setupUnreportedPage -= 1; renderSetupUnreportedSection(); });
    document.getElementById("setupUnreportedNextBtn").addEventListener("click", () => { state.setupUnreportedPage += 1; renderSetupUnreportedSection(); });

    Array.from(document.querySelectorAll("[data-status-filter]")).forEach((button) => {
      button.addEventListener("click", () => {
        state.statusFilter = button.dataset.statusFilter || "all";
        renderAll();
      });
    });

    Array.from(document.querySelectorAll("[data-range-preset]")).forEach((button) => {
      button.addEventListener("click", () => {
        const preset = button.dataset.rangePreset || "all";
        applyQuickRangePreset(preset);
      });
    });

    applyRangeBtn.addEventListener("click", () => {
      const startDate = rangeStartInput.value || "";
      const endDate = rangeEndInput.value || "";
      if (!startDate || !endDate) {
        setMessage("請先選擇開始日期與結束日期。", "error");
        return;
      }
      state.dateFilter = {
        preset: "custom",
        startDate,
        endDate,
      };
      renderAll();
    });

    clearRangeBtn.addEventListener("click", () => {
      state.dateFilter = {
        preset: "all",
        startDate: "",
        endDate: "",
      };
      rangeStartInput.value = "";
      rangeEndInput.value = "";
      renderAll();
    });

    document.getElementById("exportCurrentBtn").addEventListener("click", () => exportRangeReport("current"));
    document.getElementById("exportFirstHalfBtn").addEventListener("click", () => exportRangeReport("firstHalf"));
    document.getElementById("exportSecondHalfBtn").addEventListener("click", () => exportRangeReport("secondHalf"));
    document.getElementById("exportFullBtn").addEventListener("click", () => exportRangeReport("all"));
    document.getElementById("exportAllAnalysisBtn").addEventListener("click", () => exportAllAnalysisReport());
    document.getElementById("exportProductFlowBtn").addEventListener("click", () => exportProductFlowReport());

    shiftHoursSelect.addEventListener("change", (event) => {
      state.utilizationConfig.dailyHours = Number(event.target.value || DEFAULT_MACHINE_AVAILABLE_HOURS);
      state.rangeCache.clear();
      renderAll();
    });

    excludeHolidayToggle.addEventListener("change", (event) => {
      state.utilizationConfig.excludeHolidays = !!event.target.checked;
      state.rangeCache.clear();
      renderAll();
    });

    partSummaryToggle.addEventListener("change", (event) => {
      state.partSummaryEnabled = !!event.target.checked;
    });

    if (navToggleBtn && mesSidebar) {
      navToggleBtn.addEventListener("click", () => {
        mesSidebar.classList.toggle("is-open");
      });
    }

    if (backToTopBtn) {
      backToTopBtn.addEventListener("click", () => {
        const topAnchor = document.getElementById("mesTopAnchor");
        if (topAnchor) {
          topAnchor.scrollIntoView({ behavior: "smooth", block: "start" });
        } else {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      });
    }

    if (analysisDirectoryNav) {
      analysisDirectoryNav.addEventListener("click", (event) => {
        const button = event.target instanceof Element ? event.target.closest("[data-nav-target]") : null;
        if (!button) {
          return;
        }
        const targetId = button.getAttribute("data-nav-target");
        const targetSection = targetId ? document.getElementById(targetId) : null;
        if (targetSection) {
          const details = targetSection.closest("details");
          if (details) {
            details.open = true;
          }
          targetSection.scrollIntoView({ behavior: "smooth", block: "start" });
          if (mesSidebar) {
            mesSidebar.classList.remove("is-open");
          }
        }
      });
    }

    setupSectionNavigation();

    root.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      if (target.closest("[data-invalid-records-link]")) {
        const details = document.getElementById("invalid-records-details");
        details.open = true;
        details.querySelector("summary").focus({ preventScroll: true });
        details.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }

      if (target.id === "viewArchiveYearBtn") {
        state.selectedArchiveYear = cleanString(document.getElementById("archiveYearSelect")?.value);
        renderAll();
        const archiveSection = document.getElementById("archive-analysis");
        if (archiveSection) {
          archiveSection.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        return;
      }

      if (target.id === "exportArchiveYearBtn") {
        const year = cleanString(document.getElementById("archiveYearSelect")?.value);
        exportYearlyArchiveReport(year);
        return;
      }

      const operatorLink = target.closest("[data-operator-link]");
      if (operatorLink) {
        event.preventDefault();
        state.selectedOperator = operatorLink.getAttribute("data-operator-link") || "";
        renderAll();
        const detailAnchor = document.getElementById("operatorDetailAnchor");
        if (detailAnchor) {
          detailAnchor.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        return;
      }

      const jumpTarget = target.closest("[data-jump-target]");
      if (jumpTarget) {
        event.preventDefault();
        const targetId = jumpTarget.getAttribute("data-jump-target");
        const targetSection = targetId ? document.getElementById(targetId) : null;
        if (targetSection) {
          targetSection.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        return;
      }

      const exportButton = target.closest("[data-export-work-order]");
      if (!exportButton) {
        return;
      }
      const workOrderNo = exportButton.getAttribute("data-export-work-order");
      if (!workOrderNo) {
        return;
      }
      exportWorkOrderDetailReport(workOrderNo);
    });

    root.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
        return;
      }

      if (target.id === "archiveYearSelect") {
        state.selectedArchiveYear = cleanString(target.value);
        if (state.includeArchiveInAnalysis) {
          state.rangeCache.clear();
          renderAll();
        }
        return;
      }

      if (target.id === "includeArchiveToggle") {
        state.includeArchiveInAnalysis = !!target.checked;
        state.rangeCache.clear();
        renderAll();
      }
    });
  }

  function initializeGoogleSheetsSync() {
    if (!window.MESGoogleSheets) {
      document.getElementById("googleSyncError").hidden = false;
      document.getElementById("googleSyncError").textContent = "Google 同步模組未載入，請重新整理；Excel 匯入仍可使用。";
      return;
    }
    googleSheetsSync = window.MESGoogleSheets.createController({
      findField: (header) => findMappedField(normalizeHeader(header)),
      environmentError: () => location.protocol === "file:" ? "請使用線上 MES 網址，或已登記的 localhost；file:// 不支援 Google 授權。"
        : new Date().getTimezoneOffset() !== -480 ? "請先將電腦時區設為台北（UTC+08:00），避免與既有 MES 本地時間分析不一致。" : "",
      applyRows: (rows) => {
        if (new Date().getTimezoneOffset() !== -480) throw new Error("電腦時區不是 UTC+08:00，未套用資料，請設為台北後重試。");
        const previous = structuredClone(state);
        let savedMaster;
        try { savedMaster = localStorage.getItem(MACHINE_MASTER_STORAGE_KEY); } catch (_) { /* Storage may be unavailable. */ }
        try {
          analyzeRows(normalizeImportedRows(rows), "Google Sheets（加工紀錄表）");
        } catch (_) {
          Object.assign(state, previous);
          try {
            if (savedMaster === null) localStorage.removeItem(MACHINE_MASTER_STORAGE_KEY);
            else if (savedMaster !== undefined) localStorage.setItem(MACHINE_MASTER_STORAGE_KEY, savedMaster);
          } catch (_) { /* Keep the in-memory snapshot even if storage is unavailable. */ }
          try { renderAll(); } catch (_) { /* The sync status still reports the failure. */ }
          throw new Error("資料分析未完成，已還原同步前資料；請保留原始檔並聯絡管理者。");
        }
      },
      onStatus: (info) => {
        document.getElementById("googleSyncStatus").textContent = info.status;
        document.getElementById("googleSyncMeta").textContent = `最後成功同步：${info.lastSuccessAt ? new Date(info.lastSuccessAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false }) : "尚未同步"}｜上次成功讀取原始紀錄：${info.rowCount ?? "—"}${info.rowCount !== null ? " 筆" : ""}${info.headerRow ? `｜表頭：第 ${info.headerRow} 列` : ""}`;
        document.getElementById("googleSyncError").textContent = info.error;
        document.getElementById("googleSyncError").hidden = !info.error;
        document.getElementById("googleAuthorizeBtn").disabled = info.busy || info.manualLoading || info.authorizing;
        document.getElementById("googleSyncBtn").disabled = !info.authorized || info.busy || info.manualLoading || info.authorizing;
      },
    });
    document.getElementById("googleAuthorizeBtn").addEventListener("click", () => googleSheetsSync.authorize());
    document.getElementById("googleSyncBtn").addEventListener("click", () => googleSheetsSync.sync());
    document.getElementById("googleDisconnectBtn").addEventListener("click", () => googleSheetsSync.disconnect());
    window.addEventListener("pageshow", (event) => { if (event.persisted && state.sourceLabel.startsWith("Google Sheets")) googleSheetsSync.start(); });
    googleSheetsSync.start();
  }

  function buildAnalysisDirectory() {
    const navContainer = document.getElementById("analysisDirectoryNav");
    if (!navContainer) {
      return [];
    }

    const headings = Array.from(document.querySelectorAll(".mes-shell h2, .mes-shell h3")).filter((heading) => cleanString(heading.textContent));
    const usedIds = new Set();

    const items = headings.map((heading, index) => {
      const label = cleanString(heading.textContent);
      let targetId = cleanString(heading.id);
      if (!targetId || usedIds.has(targetId)) {
        targetId = `analysis-heading-${index + 1}`;
        heading.id = targetId;
      }
      usedIds.add(targetId);
      heading.classList.add("analysis-heading-anchor");
      heading.dataset.analysisNavLevel = heading.tagName.toLowerCase();
      return {
        heading,
        label,
        targetId,
        level: heading.tagName.toLowerCase(),
      };
    });

    navContainer.innerHTML = items
      .map(
        (item) => `
          <button class="mes-nav-link level-${item.level}" type="button" data-nav-target="${escapeHtml(item.targetId)}">
            ${escapeHtml(item.label)}
          </button>
        `
      )
      .join("");

    const navLinks = Array.from(navContainer.querySelectorAll("[data-nav-target]"));
    return items.map((item, index) => ({
      link: navLinks[index] || null,
      section: item.heading,
    }));
  }

  function setupSectionNavigation() {
    const sections = buildAnalysisDirectory().filter((item) => item.link && item.section);

    if (!sections.length) {
      return;
    }

    const navLinks = sections.map((item) => item.link);

    const setActive = (targetId) => {
      navLinks.forEach((link) => {
        link.classList.toggle("is-active", link.getAttribute("data-nav-target") === targetId);
      });
    };

    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          const visible = entries
            .filter((entry) => entry.isIntersecting)
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
          if (visible && visible.target && visible.target.id) {
            setActive(visible.target.id);
          }
        },
        {
          rootMargin: "-20% 0px -55% 0px",
          threshold: [0.1, 0.25, 0.4, 0.6],
        }
      );

      sections.forEach((item) => observer.observe(item.section));
      setActive(sections[0].section.id);
      return;
    }

    const onScroll = () => {
      let currentId = sections[0].section.id;
      sections.forEach((item) => {
        const rect = item.section.getBoundingClientRect();
        if (rect.top <= 180) {
          currentId = item.section.id;
        }
      });
      setActive(currentId);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  function ensureXlsxReady() {
    if (!window.XLSX) {
      throw new Error("目前沒有載入 Excel 解析套件，請重新整理後再試。");
    }
  }

  function ensureExcelExportReady() {
    if (!window.ExcelJS) {
      throw new Error("目前沒有載入 Excel 匯出套件，請重新整理後再試。");
    }
  }

  function createExcelWorkbook() {
    ensureExcelExportReady();
    const workbook = new window.ExcelJS.Workbook();
    workbook.creator = "MES 工時系統";
    workbook.company = "OpenAI";
    workbook.created = new Date();
    workbook.modified = new Date();
    return workbook;
  }

  async function saveExcelWorkbook(workbook, fileName) {
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob(
      [buffer],
      { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function parseWorkbookFile(file) {
    const fileName = cleanString(file.name);
    const extension = fileName.includes(".") ? fileName.split(".").pop().toLowerCase() : "";
    let workbook;

    if (extension === "csv") {
      const decodedText = await decodeTextFile(file);
      workbook = window.XLSX.read(decodedText, { type: "string", raw: false });
    } else {
      workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
    }

    const sheetNames = workbook.SheetNames || [];
    if (!sheetNames.length) {
      throw new Error("檔案中沒有可讀取的工作表。");
    }

    let sheetName = sheetNames.find((name) => cleanString(name) === "加工紀錄表");
    let sourceLabel = fileName;

    if (!sheetName) {
      if (sheetNames.length === 1) {
        sheetName = sheetNames[0];
        sourceLabel += `（單一工作表：${sheetName}）`;
      } else {
        throw new Error(`找不到「加工紀錄表」，可用工作表：${sheetNames.join("、")}`);
      }
    }

    const sheet = workbook.Sheets[sheetName];
    const rows = normalizeImportedRows(window.XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false }));
    if (!rows.length) {
      throw new Error(`工作表「${sheetName}」沒有可分析的資料。`);
    }

    return {
      rows,
      sourceLabel: `${sourceLabel}${sheetName === "加工紀錄表" ? "（使用加工紀錄表）" : ""}`,
    };
  }

  function parseTabularText(text) {
    const lines = text
      .split(/\r?\n/)
      .map((line) => normalizeImportedText(line).trim())
      .filter(Boolean);

    if (lines.length < 2) {
      throw new Error("貼上資料至少需要標題列與一筆資料。");
    }

    if (!lines[0].includes("\t")) {
      throw new Error("請貼上 tab 分隔的 TSV 資料。");
    }

    const headers = lines[0].split("\t").map((cell) => cell.trim());
    return lines.slice(1).map((line) => {
      const cells = line.split("\t");
      const row = {};
      headers.forEach((header, index) => {
        row[header] = cells[index] == null ? "" : normalizeImportedText(cells[index]).trim();
      });
      return row;
    });
  }

  async function decodeTextFile(file) {
    const buffer = await file.arrayBuffer();
    return decodeTextBuffer(buffer);
  }

  function decodeTextBuffer(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const encodings = ["utf-8", "big5"];
    let bestText = "";
    let bestScore = Number.NEGATIVE_INFINITY;

    encodings.forEach((encoding) => {
      try {
        const decoded = new TextDecoder(encoding).decode(bytes);
        const score = scoreDecodedText(decoded);
        if (score > bestScore) {
          bestText = decoded;
          bestScore = score;
        }
      } catch (error) {
        // Skip unsupported encodings on this browser.
      }
    });

    if (!bestText) {
      bestText = new TextDecoder("utf-8").decode(bytes);
    }

    return normalizeImportedText(bestText);
  }

  function scoreDecodedText(text) {
    const normalized = normalizeImportedText(text);
    const hints = ["使用者", "設備編號", "設備名稱", "製令單號", "母件編號", "需求料件", "品名規格", "動作狀態", "紀錄時間"];
    const hitScore = hints.reduce((sum, hint) => sum + (normalized.includes(hint) ? 16 : 0), 0);
    const replacementPenalty = (normalized.match(/\uFFFD/g) || []).length * 20;
    const controlPenalty = (normalized.match(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g) || []).length * 8;
    return hitScore - replacementPenalty - controlPenalty;
  }

  function normalizeImportedRows(rows) {
    return (rows || []).map((row) => {
      const normalizedRow = {};
      Object.entries(row || {}).forEach(([key, value]) => {
        normalizedRow[normalizeImportedText(key)] = typeof value === "string" ? normalizeImportedText(value) : value;
      });
      return normalizedRow;
    });
  }

  function analyzeRows(rows, sourceLabel) {
    const prepared = rows.map((row, index) => mapRowToRecord(row, index));
    const validRecords = [];
    const invalidRecords = [];

    prepared.forEach((record) => {
      if (!record.workOrderNo || !record.recordedAt || !record.actionStatus) {
        invalidRecords.push(record);
        return;
      }
      validRecords.push(record);
    });

    state.sourceLabel = sourceLabel;
    state.rawRows = rows;
    state.productClassification = window.MESProductClassification.buildCatalog(prepared.map(productClassificationName), state.productClassificationExclusions);
    state.latestOperatorRecords = buildLatestOperatorRecords(prepared);
    state.validRecords = validRecords;
    state.invalidRecords = invalidRecords;
    state.archiveData = buildYearlyArchiveData(validRecords);
    const archiveYears = state.archiveData.archiveSummary.map((item) => String(item.year));
    state.selectedArchiveYear = archiveYears.includes(state.selectedArchiveYear) ? state.selectedArchiveYear : archiveYears[0] || "";
    syncMachineMaster(validRecords);
    state.rangeCache = new Map();
    renderAll();
  }

  function buildYearlyArchiveData(records) {
    const activeRecords = [];
    const archivedByYear = {};
    const archivedOrdersByYear = {};
    const archiveSummaryMap = new Map();
    const workOrders = buildWorkOrders(records || []);

    workOrders.forEach((order) => {
      if (!order.completed || !(order.archiveEndedAt instanceof Date)) {
        activeRecords.push(...(order.rawRecords || []));
        return;
      }

      const year = String(order.archiveEndedAt.getFullYear());
      if (!archivedByYear[year]) {
        archivedByYear[year] = [];
        archivedOrdersByYear[year] = [];
      }
      archivedByYear[year].push(...(order.rawRecords || []));
      archivedOrdersByYear[year].push(order);

      if (!archiveSummaryMap.has(year)) {
        archiveSummaryMap.set(year, {
          year,
          workOrderCount: 0,
          recordCount: 0,
          totalProcessingMs: 0,
          totalWaitingMs: 0,
          leadTimes: [],
        });
      }

      const target = archiveSummaryMap.get(year);
      target.workOrderCount += 1;
      target.recordCount += (order.rawRecords || []).length;
      target.totalProcessingMs += normalizeDuration(order.totalProcessingMs);
      target.totalWaitingMs += normalizeDuration(order.totalWaitingMs);
      target.leadTimes.push(normalizeDuration(order.leadTimeMs));
    });

    const archiveSummary = Array.from(archiveSummaryMap.values())
      .map((item) => ({
        year: item.year,
        workOrderCount: item.workOrderCount,
        recordCount: item.recordCount,
        totalProcessingMs: item.totalProcessingMs,
        totalWaitingMs: item.totalWaitingMs,
        averageLeadTimeMs: item.leadTimes.length ? average(item.leadTimes) : 0,
      }))
      .sort((a, b) => Number(b.year) - Number(a.year));

    return {
      activeRecords,
      archivedByYear,
      archivedOrdersByYear,
      archiveSummary,
    };
  }

  function productClassificationName(record) {
    const field = Object.entries(record.originalRow || {}).find(([header]) => findMappedField(normalizeHeader(header)) === "productSpec");
    return field ? String(field[1] ?? "") : record.productSpec || "";
  }

  function applyProductClassification(order) {
    return window.MESProductClassification.projectOrder(order, state.productClassification,
      (order.rawRecords || []).map(productClassificationName), normalizeProductSpec);
  }

  function getProductGroupKey(order) {
    return order.productGroupKey || order.normalizedProductSpec;
  }

  function restoreProductClassification() {
    try {
      const saved = localStorage.getItem(PRODUCT_CLASSIFICATION_STORAGE_KEY);
      if (saved) state.productClassificationExclusions = window.MESProductClassification.parseSettings(saved);
    } catch (_) {
      document.getElementById("productClassificationMessage").textContent = "排除設定未能讀取，請先匯入 JSON 備份確認歸類；原儲存資料未覆寫。";
    }
  }

  function saveProductClassification(excluded) {
    const data = window.MESProductClassification.exportSettings(excluded);
    let saved = true;
    try { localStorage.setItem(PRODUCT_CLASSIFICATION_STORAGE_KEY, JSON.stringify(data)); }
    catch (_) { saved = false; }
    state.productClassificationExclusions = excluded;
    state.productClassification = window.MESProductClassification.buildCatalog(
      [...state.validRecords, ...state.invalidRecords].map(productClassificationName), excluded);
    state.archiveData = buildYearlyArchiveData(state.validRecords);
    state.rangeCache = new Map();
    renderAll();
    document.getElementById("productClassificationMessage").textContent = saved
      ? "排除設定已保存。只更新品名分組，原始事件與工時計算不變；請另匯出 JSON 備份。"
      : "瀏覽器保存失敗，設定僅在本次畫面生效；請立即匯出 JSON 備份。";
  }

  function renderProductClassification() {
    const pairs = state.productClassification.pairs;
    document.getElementById("productClassificationSummary").textContent = `找到 ${pairs.length} 組精確尾碼配對，${pairs.filter((pair) => pair.enabled).length} 組自動歸類；已保存 ${state.productClassificationExclusions.size} 組人工排除設定。`;
    document.getElementById("productClassificationTable").innerHTML = pairs.length
      ? `<table><thead><tr><th>自動歸類</th><th>原始品名（無尾碼）</th><th>統一品名</th><th>原始事件筆數（無尾碼／毛胚）</th><th>狀態</th></tr></thead><tbody>${pairs.map((pair) => `<tr><td><input type="checkbox" aria-label="自動歸類 ${escapeHtml(pair.base)}" data-product-base="${escapeHtml(pair.base)}" ${pair.enabled ? "checked" : ""} ${pair.ambiguous ? "disabled" : ""} /></td><td>${escapeHtml(pair.base)}</td><td>${escapeHtml(pair.canonical)}</td><td>${pair.baseCount} / ${pair.canonicalCount}</td><td>${pair.ambiguous ? "多重尾碼配對，待確認，不自動歸類" : pair.excluded ? "人工排除，保留各自名稱" : "自動歸類"}</td></tr>`).join("")}</tbody></table>`
      : "目前沒有同時出現有／無 -毛胚的精確名稱配對。";
  }

  function mapRowToRecord(row, index) {
    const mapped = {};
    Object.entries(row || {}).forEach(([rawKey, value]) => {
      const normalizedKey = normalizeHeader(rawKey);
      const targetField = findMappedField(normalizedKey);
      if (targetField) {
        mapped[targetField] = typeof value === "string" ? value.trim() : value;
      }
    });

    const originalProductSpec = cleanString(mapped.productSpec);
    const normalizedProductSpec = normalizeProductSpec(originalProductSpec);

    return {
      id: `row-${index + 1}`,
      originalRow: row,
      operator: cleanString(mapped.operator),
      machineId: cleanString(mapped.machineId),
      machineName: cleanString(mapped.machineName),
      workOrderNo: cleanString(mapped.workOrderNo),
      parentItemNo: cleanString(mapped.parentItemNo),
      requiredItem: cleanString(mapped.requiredItem),
      productSpec: originalProductSpec,
      normalizedProductSpec,
      quantity: parseQuantity(mapped.quantity),
      unit: cleanString(mapped.unit),
      actionStatus: normalizeStatus(mapped.actionStatus),
      recordedAt: parseDateTime(mapped.recordedAt),
      waitingHours: parseDurationString(mapped.waitingHours),
      currentWorkHours: parseDurationString(mapped.currentWorkHours),
      totalWorkHours: parseDurationString(mapped.totalWorkHours),
      totalTimeWithAllowance: parseDurationString(mapped.totalTimeWithAllowance),
      invalidReason: buildInvalidReason({
        workOrderNo: cleanString(mapped.workOrderNo),
        actionStatus: normalizeStatus(mapped.actionStatus),
        recordedAt: parseDateTime(mapped.recordedAt),
      }),
    };
  }

  function isEligibleAverageOrder(order) {
    return !!(order && order.completed && !order.hasAnomaly && !order.hasMissedPauseWarning);
  }

  function isManualPauseCheckMachine(machineId, machineName) {
    const safeId = cleanString(machineId);
    const safeName = cleanString(machineName);
    if (safeName && /CNC/i.test(safeName)) {
      return false;
    }
    if (safeId && MISSED_PAUSE_EXCLUDED_MACHINE_IDS.has(safeId)) {
      return false;
    }
    return !!(safeId && MISSED_PAUSE_INCLUDED_MACHINE_IDS.has(safeId));
  }

  function resolveMissedPauseWarning(station) {
    if (!station || station.endStatus !== "Pause") {
      return null;
    }
    const processingMs = normalizeDuration(station.processingMs);
    if (processingMs <= MISSED_PAUSE_THRESHOLD_MS) {
      return null;
    }
    if (!isManualPauseCheckMachine(station.machineId, station.machineName)) {
      return null;
    }

    return {
      machineId: station.machineId || "",
      machineName: station.machineName || "",
      machineLabel: composeMachineLabel(station.machineId, station.machineName) || "未填機台",
      operator: cleanString(station.operator) || "未填操作員",
      startStatus: station.startStatus || "",
      endStatus: station.endStatus || "",
      startAt: station.startAt,
      endAt: station.endAt,
      processingMs,
      exceededMs: Math.max(processingMs - MISSED_PAUSE_THRESHOLD_MS, 0),
      reason: `${station.startStatus || "Start"} → ${station.endStatus || "Pause"} 超過 12 小時`,
    };
  }

  function buildMissedPauseAnalysis(workOrders) {
    const warningRows = [];
    const operatorMap = new Map();

    (workOrders || []).forEach((order) => {
      (order.missedPauseWarnings || []).forEach((warning, index) => {
        const row = {
          workOrderNo: order.workOrderNo,
          productSpec: order.productSpec || "",
          quantity: order.quantity,
          machineId: warning.machineId || "",
          machineLabel: warning.machineLabel || composeMachineLabel(warning.machineId, warning.machineName) || "未填機台",
          operator: warning.operator || "未填操作員",
          startAt: warning.startAt,
          endAt: warning.endAt,
          processingMs: normalizeDuration(warning.processingMs),
          exceededMs: normalizeDuration(warning.exceededMs),
          reason: warning.reason || "疑似漏按暫停",
          warningNo: index + 1,
          statusLabel: order.statusLabel,
        };
        warningRows.push(row);

        const operatorKey = cleanString(row.operator) || "未填操作員";
        if (!operatorMap.has(operatorKey)) {
          operatorMap.set(operatorKey, {
            operator: operatorKey,
            warningCount: 0,
            workOrderSet: new Set(),
            totalProcessingMs: 0,
            maxProcessingMs: 0,
          });
        }
        const target = operatorMap.get(operatorKey);
        target.warningCount += 1;
        target.workOrderSet.add(order.workOrderNo);
        target.totalProcessingMs += row.processingMs;
        target.maxProcessingMs = Math.max(target.maxProcessingMs, row.processingMs);
      });
    });

    const operatorRanking = Array.from(operatorMap.values())
      .map((item) => ({
        operator: item.operator,
        warningCount: item.warningCount,
        workOrderCount: item.workOrderSet.size,
        totalProcessingMs: item.totalProcessingMs,
        maxProcessingMs: item.maxProcessingMs,
      }))
      .sort((a, b) => b.warningCount - a.warningCount || b.totalProcessingMs - a.totalProcessingMs || a.operator.localeCompare(b.operator, "zh-Hant"));

    return {
      warningRows: warningRows.sort((a, b) => b.processingMs - a.processingMs || a.workOrderNo.localeCompare(b.workOrderNo)),
      operatorRanking,
    };
  }

  function buildWorkOrders(records) {
    const grouped = new Map();
    records.forEach((record) => {
      if (!grouped.has(record.workOrderNo)) {
        grouped.set(record.workOrderNo, []);
      }
      grouped.get(record.workOrderNo).push(record);
    });

    return Array.from(grouped.entries())
      .map(([workOrderNo, group]) => buildWorkOrder(workOrderNo, group))
      .map(applyProductClassification)
      .sort((a, b) => {
        const aTime = a.startedAt ? a.startedAt.getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = b.startedAt ? b.startedAt.getTime() : Number.MAX_SAFE_INTEGER;
        return aTime - bTime || a.workOrderNo.localeCompare(b.workOrderNo);
      });
  }

  function buildWorkOrder(workOrderNo, group) {
    const records = [...group].sort((a, b) => a.recordedAt - b.recordedAt);
    const firstRecord = records.find((item) => item.productSpec || item.machineName || item.machineId) || records[0];
    const startRecords = records.filter((item) => item.actionStatus === "Start");
    const endRecords = records.filter((item) => item.actionStatus === "End");
    const firstStartRecord = startRecords[0] || null;
    const firstEndRecord = endRecords[0] || null;
    const latestEndRecord = endRecords.length ? endRecords[endRecords.length - 1] : null;
    const duplicateEndRecords = firstEndRecord ? endRecords.slice(1) : [];
    const anomalies = [];
    const notes = [];
    const stations = [];
    let currentStation = null;
    let lastPauseRecord = null;
    let lastStatusSeen = "";
    let proxyEndInfo = null;

    if (startRecords.length > 1) {
      anomalies.push("同一製令單出現多個 Start");
    }

    records.forEach((record) => {
      lastStatusSeen = record.actionStatus || lastStatusSeen;

      if (record.actionStatus === "Start") {
        if (currentStation) {
          anomalies.push("Start 前已有未完成加工段");
          return;
        }

        currentStation = createStation(stations.length + 1, record);
        lastPauseRecord = null;
        return;
      }

      if (record.actionStatus === "Resume") {
        if (currentStation) {
          anomalies.push("Resume 前缺少 Pause");
          return;
        }

        const previousStation = stations[stations.length - 1];
        if (!previousStation || previousStation.endStatus !== "Pause") {
          anomalies.push("Resume 找不到對應 Pause");
        }

        currentStation = createStation(stations.length + 1, record);
        lastPauseRecord = null;
        return;
      }

      if (record.actionStatus === "Pause") {
        if (!currentStation) {
          anomalies.push("Pause 前缺少 Start / Resume");
          return;
        }

        currentStation.machineId = currentStation.machineId || record.machineId;
        currentStation.machineName = currentStation.machineName || record.machineName;
        currentStation.machineKey = getMachineKey(currentStation.machineId, currentStation.machineName);
        currentStation.operator = currentStation.operator || record.operator;
        currentStation.endStatus = "Pause";
        currentStation.endAt = record.recordedAt;
        currentStation.processingMs = resolveProcessingDuration(currentStation.startAt, record.recordedAt, record.currentWorkHours);
        currentStation.missedPauseWarning = resolveMissedPauseWarning(currentStation);
        if (record.recordedAt instanceof Date && currentStation.startAt instanceof Date && record.recordedAt.getTime() < currentStation.startAt.getTime()) {
          anomalies.push("Pause 時間早於 Start / Resume");
        }
        stations.push(currentStation);
        currentStation = null;
        lastPauseRecord = record;
        return;
      }

      if (record.actionStatus === "End") {
        if (firstEndRecord && record !== firstEndRecord) {
          notes.push(`重複 End（不納入計算）：${formatDateTime(record.recordedAt)}`);
          return;
        }

        if (!firstStartRecord) {
          anomalies.push("有 End 但沒有 Start");
        }

        if (!currentStation) {
          if (lastPauseRecord) {
            const previousStation = stations[stations.length - 1];
            if (previousStation && previousStation.endStatus === "Pause") {
              proxyEndInfo = {
                pauseOperator: cleanString(lastPauseRecord.operator),
                endOperator: cleanString(record.operator),
                pauseAt: lastPauseRecord.recordedAt,
                endAt: record.recordedAt,
                sameUser: cleanString(lastPauseRecord.operator) === cleanString(record.operator),
              };
              if (proxyEndInfo.sameUser) {
                notes.push("上一筆 Pause 後補按 End");
              } else {
                notes.push("End 由不同使用者按下，工時採計至前一筆 Pause");
              }
              lastPauseRecord = null;
              return;
            }
          }

          if (!stations.length) {
            anomalies.push("End 出現在加工段之外");
          }
          return;
        }

        currentStation.machineId = currentStation.machineId || record.machineId;
        currentStation.machineName = currentStation.machineName || record.machineName;
        currentStation.machineKey = getMachineKey(currentStation.machineId, currentStation.machineName);
        currentStation.operator = currentStation.operator || record.operator;
        currentStation.endStatus = "End";
        currentStation.endAt = record.recordedAt;
        currentStation.processingMs = resolveProcessingDuration(currentStation.startAt, record.recordedAt, record.currentWorkHours);
        currentStation.waitingAfterMs = 0;
        currentStation.waitToMachine = "";
        applyStationUtilization(currentStation, records);
        if (record.recordedAt instanceof Date && currentStation.startAt instanceof Date && record.recordedAt.getTime() < currentStation.startAt.getTime()) {
          anomalies.push("End 時間早於 Start / Resume");
        }
        stations.push(currentStation);
        currentStation = null;
        lastPauseRecord = null;
      }
    });

    if (currentStation) {
      currentStation.isOpen = true;
      currentStation.endStatus = "加工中";
      currentStation.endAt = records[records.length - 1] ? records[records.length - 1].recordedAt : currentStation.startAt;
      currentStation.processingMs = resolveProcessingDuration(currentStation.startAt, currentStation.endAt, currentStation.processingMs);
      applyStationUtilization(currentStation, records);
      stations.push(currentStation);
    }

    const completed = !!firstEndRecord;
    const startedAt = firstStartRecord ? firstStartRecord.recordedAt : records[0].recordedAt;
    const finishedAt = completed ? firstEndRecord.recordedAt : null;
    const archiveEndedAt = completed ? (latestEndRecord ? latestEndRecord.recordedAt : finishedAt) : null;
    const latestRecordedAt = records[records.length - 1] ? records[records.length - 1].recordedAt : startedAt;
    const stationTransitions = buildStationTransitions(stations);
    stations.forEach((station) => applyStationUtilization(station, records));
    const machineWorkSummary = buildMachineWorkSummary(stations, stationTransitions);
    const missedPauseWarnings = stations
      .filter((station) => station.missedPauseWarning)
      .map((station) => ({
        ...station.missedPauseWarning,
        machineKey: station.machineKey || getMachineKey(station.machineId, station.machineName),
        stationNo: station.stationNo,
      }));
    const segmentProcessingMs = stations.reduce((sum, station) => sum + (station.processingMs || 0), 0);
    const totalProcessingMs = segmentProcessingMs;
    const totalWaitingMs = calculateTotalTransitionWaiting(stationTransitions);
    const leadTimeMs = calculateLeadTime(totalProcessingMs, totalWaitingMs);
    const totalTimeWithAllowance = calculateWidenedDuration(totalProcessingMs);
    const machineRoute = machineWorkSummary.map((item) => item.stationName).filter(Boolean);

    if (completed && startedAt instanceof Date && finishedAt instanceof Date && finishedAt.getTime() < startedAt.getTime()) {
      anomalies.push("End 早於 Start");
    }

    if (!completed && startedAt instanceof Date && latestRecordedAt instanceof Date) {
      const unfinishedSpan = latestRecordedAt.getTime() - startedAt.getTime();
      if (unfinishedSpan > MAX_UNFINISHED_MS) {
        anomalies.push("超過 30 天未結束");
      }
    }

    if (duplicateEndRecords.length) {
      notes.push("同一製令單出現多個 End，已採用第一次 End，後續 End 不納入計算");
    }

    if (missedPauseWarnings.length) {
      notes.push(`⚠ 疑似漏按暫停 ${missedPauseWarnings.length} 筆`);
    }

    const utilization = calculateMachineUtilization({
      records,
      stations,
      processingHoursMs: totalProcessingMs,
      completed,
      hasAnomaly: anomalies.length > 0,
      startRecordCount: startRecords.length,
    });
    const stationAnalysis = machineWorkSummary.map((station) => {
      return {
        stationNo: station.stationNo,
        stationName: station.stationName,
        operator: station.operator || "未填操作員",
        machineKey: station.machineKey,
        processingHours: station.processingHours,
        waitingHours: station.waitingHours,
        flowUtilization: station.flowUtilization,
        machineUtilizationWithHoliday: station.machineUtilizationWithHoliday,
        machineUtilizationWithoutHoliday: station.machineUtilizationWithoutHoliday,
        totalHours: station.totalHours,
        pauseCount: station.pauseCount,
        resumeCount: station.resumeCount,
        segmentCount: (station.segments || []).length,
        averageSegmentMs: (station.segments || []).length ? Math.round(station.processingHours / station.segments.length) : 0,
        startStatus: station.startStatus,
        endStatus: station.endStatus,
        startAt: station.startAt,
        endAt: station.endAt,
        transitions: station.transitions,
        segments: station.segments,
        missedPauseWarning: station.missedPauseWarning || null,
      };
    });
    const averageWaitingMs = stationTransitions.length ? Math.round(totalWaitingMs / stationTransitions.length) : 0;
    const flowUtilization = calculateRatio(totalProcessingMs, leadTimeMs);

    return {
      workOrderNo,
      productSpec: firstNonEmpty(records.map((item) => item.productSpec)),
      normalizedProductSpec: firstNonEmpty(records.map((item) => item.normalizedProductSpec)),
      quantity: firstNonEmpty(records.map((item) => item.quantity)),
      unit: firstNonEmpty(records.map((item) => item.unit)),
      parentItemNo: firstNonEmpty(records.map((item) => item.parentItemNo)),
      requiredItem: firstNonEmpty(records.map((item) => item.requiredItem)),
      machineRoute,
      machineKeys: Array.from(new Set(stations.map((station) => getMachineKey(station.machineId, station.machineName)).filter(Boolean))),
      stations,
      stationTransitions,
      machineWorkSummary,
      rawRecords: records,
      totalProcessingMs,
      totalWaitingMs,
      averageWaitingMs,
      totalHoursMs: leadTimeMs,
      totalTimeWithAllowance,
      leadTimeMs,
      completed,
      startedAt,
      finishedAt,
      archiveEndedAt,
      archiveYear: archiveEndedAt instanceof Date ? String(archiveEndedAt.getFullYear()) : "",
      latestRecordedAt,
      flowHint: resolveFlowHint(stations, firstEndRecord, completed, duplicateEndRecords, proxyEndInfo),
      duplicateEndCount: duplicateEndRecords.length,
      notes,
      proxyEndInfo,
      missedPauseWarnings,
      hasMissedPauseWarning: missedPauseWarnings.length > 0,
      includeInAverage: isEligibleAverageOrder({ completed, hasAnomaly: anomalies.length > 0, hasMissedPauseWarning: missedPauseWarnings.length > 0 }),
      statusLabel: resolveWorkOrderStatus(stations, lastStatusSeen, completed),
      anomalies,
      hasAnomaly: anomalies.length > 0,
      availableHoursWithHolidayMs: utilization.availableHoursWithHolidayMs,
      availableHoursWithoutHolidayMs: utilization.availableHoursWithoutHolidayMs,
      processingHoursMs: utilization.processingHoursMs,
      utilizationWithHoliday: utilization.utilizationWithHoliday,
      utilizationWithoutHoliday: utilization.utilizationWithoutHoliday,
      includeInUtilizationAverage: utilization.includeInAverage,
      utilizationNote: utilization.note,
      flowUtilization,
      stationAnalysis,
      valveType: classifyValveType(firstRecord.productSpec || firstRecord.requiredItem),
      searchText: buildOrderSearchText({
        workOrderNo,
        productSpec: firstNonEmpty(records.map((item) => item.productSpec)),
        normalizedProductSpec: firstNonEmpty(records.map((item) => item.normalizedProductSpec)),
        parentItemNo: firstNonEmpty(records.map((item) => item.parentItemNo)),
        requiredItem: firstNonEmpty(records.map((item) => item.requiredItem)),
        machineRoute,
        stations,
      }),
    };
  }

  function createStation(stationNo, record) {
    return {
      stationNo,
      machineId: record.machineId,
      machineName: record.machineName,
      machineKey: getMachineKey(record.machineId, record.machineName),
      operator: record.operator,
      startStatus: record.actionStatus,
      startAt: record.recordedAt,
      endStatus: "",
      endAt: null,
      processingMs: 0,
      waitingAfterMs: 0,
      waitToMachine: "",
      flowUtilization: null,
      stationUtilization: null,
      machineAvailableWithHolidayMs: 0,
      machineAvailableWithoutHolidayMs: 0,
      machineUtilizationWithHoliday: null,
      machineUtilizationWithoutHoliday: null,
      missedPauseWarning: null,
      isOpen: false,
    };
  }

  function buildStationTransitions(stations) {
    const transitions = [];

    stations.forEach((station) => {
      station.waitingAfterMs = 0;
      station.waitToMachine = "";
      station.sameMachineContinuation = false;
    });

    for (let index = 0; index < stations.length - 1; index += 1) {
      const fromStation = stations[index];
      const toStation = stations[index + 1];
      const fromKey = getMachineKey(fromStation.machineId, fromStation.machineName);
      const toKey = getMachineKey(toStation.machineId, toStation.machineName);

      if (!fromKey || !toKey) {
        continue;
      }

      if (fromKey === toKey) {
        fromStation.sameMachineContinuation = true;
        fromStation.waitToMachine = "同機台續工";
        continue;
      }

      const waitingMs = calculateStationWaitingHours(fromStation.endAt, toStation.startAt);
      fromStation.waitingAfterMs = waitingMs;
      fromStation.waitToMachine = composeMachineLabel(toStation.machineId, toStation.machineName) || "下一站";

      transitions.push({
        transitionNo: transitions.length + 1,
        fromMachineKey: fromKey,
        toMachineKey: toKey,
        fromStation: composeMachineLabel(fromStation.machineId, fromStation.machineName) || "未填機台",
        toStation: composeMachineLabel(toStation.machineId, toStation.machineName) || "未填機台",
        fromEndTime: fromStation.endAt,
        toStartTime: toStation.startAt,
        waitingMs,
      });
    }

    return transitions;
  }

  function buildMachineWorkSummary(stations, stationTransitions) {
    const machineMap = new Map();

    stations.forEach((station) => {
      const machineKey = getMachineKey(station.machineId, station.machineName);
      if (!machineKey) {
        return;
      }

      if (!machineMap.has(machineKey)) {
        machineMap.set(machineKey, {
          stationNo: machineMap.size + 1,
          stationName: composeMachineLabel(station.machineId, station.machineName) || "未填機台",
          machineId: station.machineId || "",
          machineName: station.machineName || "",
          machineKey,
          operator: station.operator || "",
          processingHours: 0,
          waitingHours: 0,
          totalHours: 0,
          flowUtilization: null,
          machineUtilizationWithHoliday: null,
          machineUtilizationWithoutHoliday: null,
          missedPauseWarningCount: 0,
          missedPauseWarnings: [],
          pauseCount: 0,
          resumeCount: 0,
          startStatus: station.startStatus,
          endStatus: station.endStatus,
          startAt: station.startAt,
          endAt: station.endAt,
          transitions: [],
          segments: [],
        });
      }

      const summary = machineMap.get(machineKey);
      summary.processingHours += normalizeDuration(station.processingMs);
      summary.missedPauseWarningCount += station.missedPauseWarning ? 1 : 0;
      if (station.missedPauseWarning) {
        summary.missedPauseWarnings.push(station.missedPauseWarning);
      }
      summary.pauseCount += station.endStatus === "Pause" ? 1 : 0;
      summary.resumeCount += station.startStatus === "Resume" ? 1 : 0;
      summary.startAt = earlierDate(summary.startAt, station.startAt);
      summary.endAt = laterDate(summary.endAt, station.endAt);
      if (!summary.operator && station.operator) {
        summary.operator = station.operator;
      }
      summary.endStatus = station.endStatus || summary.endStatus;
      summary.segments.push({
        segmentNo: summary.segments.length + 1,
        operator: station.operator || "",
        startStatus: station.startStatus,
        endStatus: station.endStatus,
        startAt: station.startAt,
        endAt: station.endAt,
        processingMs: normalizeDuration(station.processingMs),
      });
    });

    (stationTransitions || []).forEach((transition) => {
      const summary = machineMap.get(transition.fromMachineKey);
      if (!summary) {
        return;
      }
      summary.waitingHours += normalizeDuration(transition.waitingMs);
      summary.transitions.push(transition);
    });

    return Array.from(machineMap.values()).map((summary) => {
      summary.totalHours = summary.processingHours + summary.waitingHours;
      summary.flowUtilization = calculateRatio(summary.processingHours, summary.totalHours);
      summary.hasMissedPauseWarning = summary.missedPauseWarningCount > 0;
      summary.missedPauseWarning = summary.missedPauseWarnings[0] || null;
      return summary;
    });
  }

  function calculateStationWaitingHours(fromEndTime, toStartTime) {
    if (!(fromEndTime instanceof Date) || !(toStartTime instanceof Date)) {
      return 0;
    }
    return Math.max(toStartTime.getTime() - fromEndTime.getTime(), 0);
  }

  function calculateTotalTransitionWaiting(transitions) {
    return (transitions || []).reduce((sum, transition) => sum + normalizeDuration(transition.waitingMs), 0);
  }

  function calculateLeadTime(totalProcessingMs, totalWaitingMs) {
    return normalizeDuration(totalProcessingMs) + normalizeDuration(totalWaitingMs);
  }

  function earlierDate(a, b) {
    if (!(a instanceof Date)) {
      return b;
    }
    if (!(b instanceof Date)) {
      return a;
    }
    return a.getTime() <= b.getTime() ? a : b;
  }

  function laterDate(a, b) {
    if (!(a instanceof Date)) {
      return b;
    }
    if (!(b instanceof Date)) {
      return a;
    }
    return a.getTime() >= b.getTime() ? a : b;
  }

  function buildStandards(workOrders) {
    const groups = new Map();

    workOrders
      .filter((order) => isEligibleAverageOrder(order) && order.normalizedProductSpec)
      .forEach((order) => {
        if (!groups.has(getProductGroupKey(order))) {
          groups.set(getProductGroupKey(order), []);
        }
        groups.get(getProductGroupKey(order)).push(order);
      });

    return Array.from(groups.entries())
      .map(([productGroupKey, orders]) => {
        const normalizedProductSpec = orders[0].normalizedProductSpec;
        const processing = orders.map((item) => item.totalProcessingMs);
        const waiting = orders.map((item) => item.totalWaitingMs);
        const lead = orders.map((item) => item.leadTimeMs);

        return {
          productGroupKey,
          normalizedProductSpec,
          productSpec: orders[0].productSpec || normalizedProductSpec,
          completedCount: orders.length,
          avgProcessingMs: average(processing),
          avgWaitingMs: average(waiting),
          avgLeadTimeMs: average(lead),
          suggestedScheduleMs: average(lead),
          canSchedule: orders.length > 0,
        };
      })
      .sort((a, b) => b.completedCount - a.completedCount || a.productSpec.localeCompare(b.productSpec));
  }

  function buildScheduleRows(workOrders, standards) {
    const standardMap = new Map(standards.map((item) => [getProductGroupKey(item), item]));
    const partMachineStandardMap = new Map();
    const machineStandardMap = new Map();

    workOrders
      .filter((order) => isEligibleAverageOrder(order))
      .forEach((order) => {
        (order.machineWorkSummary || []).forEach((machine) => {
          if (machine.hasMissedPauseWarning) {
            return;
          }
          if (order.normalizedProductSpec && machine.machineKey) {
            const partMachineKey = `${getProductGroupKey(order)}::${machine.machineKey}`;
            if (!partMachineStandardMap.has(partMachineKey)) {
              partMachineStandardMap.set(partMachineKey, []);
            }
            partMachineStandardMap.get(partMachineKey).push(normalizeDuration(machine.processingHours));
          }
          if (machine.machineKey) {
            if (!machineStandardMap.has(machine.machineKey)) {
              machineStandardMap.set(machine.machineKey, []);
            }
            machineStandardMap.get(machine.machineKey).push(normalizeDuration(machine.processingHours));
          }
        });
      });

    return workOrders
      .filter((order) => !order.completed)
      .map((order) => {
        const standard = order.normalizedProductSpec ? standardMap.get(getProductGroupKey(order)) : null;
        const primaryMachineKey = (order.machineKeys || [])[0] || "";
        const partMachineKey = order.normalizedProductSpec && primaryMachineKey ? `${getProductGroupKey(order)}::${primaryMachineKey}` : "";
        const partMachineValues = partMachineKey ? partMachineStandardMap.get(partMachineKey) : null;
        const machineValues = primaryMachineKey ? machineStandardMap.get(primaryMachineKey) : null;
        const estimatedProcessingMs = partMachineValues?.length
          ? average(partMachineValues)
          : standard
          ? standard.avgProcessingMs
          : machineValues?.length
          ? average(machineValues)
          : null;
        const estimatedWaitingMs = standard ? standard.avgWaitingMs : null;
        const estimatedLeadTimeMs = standard ? standard.avgLeadTimeMs : null;
        const remainingMs = estimatedProcessingMs != null
          ? Math.max((estimatedProcessingMs || 0) + (estimatedWaitingMs || 0) - order.totalProcessingMs - order.totalWaitingMs, 0)
          : null;
        const scheduleSource = partMachineValues?.length
          ? "同料件 + 同機台標準工時"
          : standard
          ? "同料件標準工時"
          : machineValues?.length
          ? "同機台標準工時"
          : "需要人工估時";

        return {
          workOrderNo: order.workOrderNo,
          productSpec: order.productSpec,
          quantity: order.quantity,
          statusLabel: order.statusLabel,
          accumulatedProcessingMs: order.totalProcessingMs,
          accumulatedWaitingMs: order.totalWaitingMs,
          estimatedProcessingMs,
          estimatedWaitingMs,
          estimatedLeadTimeMs,
          remainingMs,
          note: scheduleSource,
          noteType: scheduleSource === "需要人工估時" ? "manual" : "pending",
        };
      })
      .sort((a, b) => a.workOrderNo.localeCompare(b.workOrderNo));
  }

  function buildProductSpecComparisons(workOrders) {
    const groups = new Map();
    workOrders.forEach((order) => {
      if (!order.normalizedProductSpec) {
        return;
      }
      if (!groups.has(getProductGroupKey(order))) {
        groups.set(getProductGroupKey(order), []);
      }
      groups.get(getProductGroupKey(order)).push(order);
    });

    return Array.from(groups.entries())
      .map(([productGroupKey, orders]) => {
        const normalizedProductSpec = orders[0].normalizedProductSpec;
        const sortedOrders = [...orders].sort((a, b) => {
          const aTime = a.startedAt ? a.startedAt.getTime() : Number.MAX_SAFE_INTEGER;
          const bTime = b.startedAt ? b.startedAt.getTime() : Number.MAX_SAFE_INTEGER;
          return aTime - bTime || a.workOrderNo.localeCompare(b.workOrderNo);
        });
        const eligibleOrders = sortedOrders.filter((order) => isEligibleAverageOrder(order));
        const quantitySummary = summarizeOrderQuantities(sortedOrders);

        return {
          productGroupKey,
          normalizedProductSpec,
          productSpec: sortedOrders[0].productSpec || normalizedProductSpec,
          orderCount: sortedOrders.length,
          completedCount: sortedOrders.filter((item) => item.completed).length,
          includeCount: eligibleOrders.length,
          totalQuantity: quantitySummary.hasQuantity ? quantitySummary.totalQuantity : null,
          totalQuantityText: formatQuantitySummaryText(quantitySummary),
          avgProcessingMs: eligibleOrders.length ? average(eligibleOrders.map((item) => item.totalProcessingMs)) : 0,
          avgWaitingMs: eligibleOrders.length ? average(eligibleOrders.map((item) => item.totalWaitingMs)) : 0,
          avgLeadTimeMs: eligibleOrders.length ? average(eligibleOrders.map((item) => item.leadTimeMs)) : 0,
          avgAllowanceMs: eligibleOrders.length ? average(eligibleOrders.map((item) => item.totalTimeWithAllowance)) : 0,
          orders: sortedOrders,
        };
      })
      .filter((group) => group.orderCount >= 2)
      .sort((a, b) => a.productSpec.localeCompare(b.productSpec));
  }

  function buildProductSpecFlowAnalysis(workOrders, searchTerm) {
    const groups = new Map();

    (workOrders || []).forEach((order) => {
      if (!order.normalizedProductSpec) {
        return;
      }
      if (!groups.has(getProductGroupKey(order))) {
        groups.set(getProductGroupKey(order), []);
      }
      groups.get(getProductGroupKey(order)).push(order);
    });

    const keyword = normalizeSearchText(searchTerm);

    return Array.from(groups.entries())
      .map(([productGroupKey, orders]) => {
        const normalizedProductSpec = orders[0].normalizedProductSpec;
        const sortedOrders = [...orders].sort((a, b) => {
          const aTime = a.startedAt ? a.startedAt.getTime() : Number.MAX_SAFE_INTEGER;
          const bTime = b.startedAt ? b.startedAt.getTime() : Number.MAX_SAFE_INTEGER;
          return aTime - bTime || a.workOrderNo.localeCompare(b.workOrderNo);
        });
        const eligibleOrders = sortedOrders.filter((order) => isEligibleAverageOrder(order));
        const quantitySummary = summarizeOrderQuantities(sortedOrders);
        const machineMetaMap = new Map();
        const machinePositionMap = new Map();
        const routeTemplates = new Map();
        const transitionMetaMap = new Map();
        const transitionPositionMap = new Map();

        sortedOrders.forEach((order) => {
          const routeKeys = (order.machineWorkSummary || [])
            .map((machine, index) => {
              const machineKey = machine.machineKey || getMachineKey(machine.machineId, machine.machineName);
              if (!machineKey) {
                return "";
              }
              if (!machineMetaMap.has(machineKey)) {
                machineMetaMap.set(machineKey, {
                  machineKey,
                  stationName: machine.stationName || composeMachineLabel(machine.machineId, machine.machineName) || machineKey,
                  machineId: machine.machineId || "",
                  machineName: machine.machineName || "",
                });
              }
              if (!machinePositionMap.has(machineKey)) {
                machinePositionMap.set(machineKey, []);
              }
              machinePositionMap.get(machineKey).push(index);
              return machineKey;
            })
            .filter(Boolean);

          if (routeKeys.length) {
            const templateKey = routeKeys.join("||");
            if (!routeTemplates.has(templateKey)) {
              routeTemplates.set(templateKey, {
                keys: routeKeys,
                count: 0,
                weight: 0,
              });
            }
            const target = routeTemplates.get(templateKey);
            target.count += 1;
            target.weight += isEligibleAverageOrder(order) ? 10 : 1;
          }

          (order.stationTransitions || []).forEach((transition, index) => {
            const fromKey = cleanString(transition.fromMachineKey);
            const toKey = cleanString(transition.toMachineKey);
            if (!fromKey || !toKey || fromKey === toKey) {
              return;
            }
            const transitionKey = `${fromKey}>>>${toKey}`;
            if (!transitionMetaMap.has(transitionKey)) {
              transitionMetaMap.set(transitionKey, {
                transitionKey,
                fromMachineKey: fromKey,
                toMachineKey: toKey,
                fromStation: transition.fromStation,
                toStation: transition.toStation,
                label: `${transition.fromStation} → ${transition.toStation}`,
              });
            }
            if (!transitionPositionMap.has(transitionKey)) {
              transitionPositionMap.set(transitionKey, []);
            }
            transitionPositionMap.get(transitionKey).push(index);
          });
        });

        const templateRoute = Array.from(routeTemplates.values())
          .sort((a, b) => b.weight - a.weight || b.count - a.count || b.keys.length - a.keys.length)[0];
        const orderedMachineKeys = [];
        const seenMachineKeys = new Set();

        (templateRoute ? templateRoute.keys : []).forEach((machineKey) => {
          if (!seenMachineKeys.has(machineKey)) {
            seenMachineKeys.add(machineKey);
            orderedMachineKeys.push(machineKey);
          }
        });

        Array.from(machineMetaMap.keys())
          .sort((a, b) => {
            const aPositions = machinePositionMap.get(a) || [];
            const bPositions = machinePositionMap.get(b) || [];
            const aAverage = aPositions.length ? average(aPositions) : Number.MAX_SAFE_INTEGER;
            const bAverage = bPositions.length ? average(bPositions) : Number.MAX_SAFE_INTEGER;
            const aLabel = machineMetaMap.get(a).stationName;
            const bLabel = machineMetaMap.get(b).stationName;
            return aAverage - bAverage || aLabel.localeCompare(bLabel, "zh-Hant");
          })
          .forEach((machineKey) => {
            if (!seenMachineKeys.has(machineKey)) {
              seenMachineKeys.add(machineKey);
              orderedMachineKeys.push(machineKey);
            }
          });

        const machineColumns = orderedMachineKeys
          .map((machineKey) => machineMetaMap.get(machineKey))
          .filter(Boolean);

        const transitionColumns = Array.from(transitionMetaMap.values()).sort((a, b) => {
          const aFromIndex = orderedMachineKeys.indexOf(a.fromMachineKey);
          const bFromIndex = orderedMachineKeys.indexOf(b.fromMachineKey);
          const aToIndex = orderedMachineKeys.indexOf(a.toMachineKey);
          const bToIndex = orderedMachineKeys.indexOf(b.toMachineKey);
          const aPos = aFromIndex >= 0 ? aFromIndex : Number.MAX_SAFE_INTEGER;
          const bPos = bFromIndex >= 0 ? bFromIndex : Number.MAX_SAFE_INTEGER;
          const aNext = aToIndex >= 0 ? aToIndex : Number.MAX_SAFE_INTEGER;
          const bNext = bToIndex >= 0 ? bToIndex : Number.MAX_SAFE_INTEGER;
          return aPos - bPos || aNext - bNext || a.label.localeCompare(b.label, "zh-Hant");
        });

        const displayColumns = [];
        machineColumns.forEach((machine) => {
          displayColumns.push({ type: "machine", machineKey: machine.machineKey, label: machine.stationName });
          transitionColumns
            .filter((transition) => transition.fromMachineKey === machine.machineKey)
            .forEach((transition) => {
              displayColumns.push({
                type: "waiting",
                transitionKey: transition.transitionKey,
                label: transition.label,
              });
            });
        });

        const orderRows = sortedOrders.map((order) => {
          const machineCellMap = new Map();
          (order.machineWorkSummary || []).forEach((machine) => {
            const machineKey = machine.machineKey || getMachineKey(machine.machineId, machine.machineName);
            if (!machineKey) {
              return;
            }
            machineCellMap.set(machineKey, normalizeDuration(machine.processingHours));
          });

          const transitionCellMap = new Map();
          (order.stationTransitions || []).forEach((transition) => {
            const fromKey = cleanString(transition.fromMachineKey);
            const toKey = cleanString(transition.toMachineKey);
            if (!fromKey || !toKey || fromKey === toKey) {
              return;
            }
            const transitionKey = `${fromKey}>>>${toKey}`;
            transitionCellMap.set(
              transitionKey,
              normalizeDuration(transitionCellMap.get(transitionKey)) + normalizeDuration(transition.waitingMs)
            );
          });

          const flowLeadTimeMs = normalizeDuration(order.totalProcessingMs) + normalizeDuration(order.totalWaitingMs);
          const flowAllowanceMs = calculateWidenedDuration(order.totalProcessingMs);
          const unitProcessingMs = calculateUnitProcessingMs(order.totalProcessingMs, order.quantity);

          return {
            ...order,
            machineCellMap,
            transitionCellMap,
            flowLeadTimeMs,
            flowAllowanceMs,
            unitProcessingMs,
            machineRouteText: order.machineRoute.length ? order.machineRoute.join(" → ") : "尚未形成流程",
          };
        });

        const machineAverages = machineColumns
          .map((machine) => {
            const values = eligibleOrders
              .map((order) => {
                const summary = (order.machineWorkSummary || []).find((item) => (item.machineKey || getMachineKey(item.machineId, item.machineName)) === machine.machineKey);
                return normalizeDuration(summary && summary.processingHours);
              })
              .filter((value) => value > 0);

            return {
              machineKey: machine.machineKey,
              stationName: machine.stationName,
              sampleCount: values.length,
              averageMs: values.length ? average(values) : 0,
            };
          })
          .filter((item) => item.sampleCount > 0);

        const transitionAverages = transitionColumns
          .map((transition) => {
            const values = eligibleOrders
              .map((order) => {
                return (order.stationTransitions || []).reduce((sum, item) => {
                  if (
                    cleanString(item.fromMachineKey) === transition.fromMachineKey &&
                    cleanString(item.toMachineKey) === transition.toMachineKey
                  ) {
                    return sum + normalizeDuration(item.waitingMs);
                  }
                  return sum;
                }, 0);
              })
              .filter((value) => value > 0);

          return {
            transitionKey: transition.transitionKey,
            label: transition.label,
            sampleCount: values.length,
            averageMs: values.length ? average(values) : 0,
            };
          })
          .filter((item) => item.sampleCount > 0);

        const routeGroupMap = new Map();
        orderRows.forEach((order) => {
          const routeMachines = (order.machineWorkSummary || [])
            .map((machine) => {
              const machineKey = machine.machineKey || getMachineKey(machine.machineId, machine.machineName);
              if (!machineKey) {
                return null;
              }
              return {
                machineKey,
                stationName: machine.stationName || composeMachineLabel(machine.machineId, machine.machineName) || machineKey,
                machineId: machine.machineId || "",
                machineName: machine.machineName || "",
              };
            })
            .filter(Boolean);

          const routeKey = routeMachines.map((item) => item.machineKey).join("||") || "__NO_ROUTE__";
          if (!routeGroupMap.has(routeKey)) {
            const waitingColumns = [];
            const displayColumns = [];
            routeMachines.forEach((machine, index) => {
              displayColumns.push({
                type: "machine",
                machineKey: machine.machineKey,
                label: machine.stationName,
              });
              const nextMachine = routeMachines[index + 1];
              if (nextMachine && nextMachine.machineKey !== machine.machineKey) {
                const transitionKey = `${machine.machineKey}>>>${nextMachine.machineKey}`;
                waitingColumns.push({
                  transitionKey,
                  fromMachineKey: machine.machineKey,
                  toMachineKey: nextMachine.machineKey,
                  fromStation: machine.stationName,
                  toStation: nextMachine.stationName,
                  label: `${machine.stationName}→${nextMachine.stationName}`,
                });
                displayColumns.push({
                  type: "waiting",
                  transitionKey,
                  label: `${machine.stationName}→${nextMachine.stationName}`,
                });
              }
            });

            routeGroupMap.set(routeKey, {
              routeKey,
              routeLabel: routeMachines.length ? routeMachines.map((item) => item.stationName).join(" → ") : "尚未形成流程",
              machineColumns: routeMachines,
              waitingColumns,
              displayColumns,
              orders: [],
            });
          }

          routeGroupMap.get(routeKey).orders.push(order);
        });

        const routeGroups = Array.from(routeGroupMap.values())
          .map((routeGroup) => {
            const routeEligibleOrders = routeGroup.orders.filter((order) => isEligibleAverageOrder(order));
            const routeMachineAverages = routeGroup.machineColumns
              .map((machine) => {
                const values = routeEligibleOrders
                  .map((order) => normalizeDuration(order.machineCellMap.get(machine.machineKey) || 0))
                  .filter((value) => value > 0);

                return {
                  machineKey: machine.machineKey,
                  stationName: machine.stationName,
                  sampleCount: values.length,
                  averageMs: values.length ? average(values) : 0,
                };
              })
              .filter((item) => item.sampleCount > 0);

            const routeWaitingAverages = routeGroup.waitingColumns
              .map((transition) => {
                const values = routeEligibleOrders
                  .map((order) => normalizeDuration(order.transitionCellMap.get(transition.transitionKey) || 0))
                  .filter((value) => value > 0);

                return {
                  transitionKey: transition.transitionKey,
                  label: transition.label,
                  sampleCount: values.length,
                  averageMs: values.length ? average(values) : 0,
                };
              })
              .filter((item) => item.sampleCount > 0);

            return {
              ...routeGroup,
              orderCount: routeGroup.orders.length,
              analysisSampleCount: routeEligibleOrders.length,
              machineAverages: routeMachineAverages,
              waitingAverages: routeWaitingAverages,
              averageTotalProcessingMs: routeEligibleOrders.length ? average(routeEligibleOrders.map((order) => order.totalProcessingMs)) : 0,
              averageUnitProcessingMs: calculateWeightedUnitProcessingMs(routeGroup.orders),
              averageTotalWaitingMs: routeEligibleOrders.length ? average(routeEligibleOrders.map((order) => order.totalWaitingMs)) : 0,
              averageLeadTimeMs: routeEligibleOrders.length ? average(routeEligibleOrders.map((order) => order.flowLeadTimeMs)) : 0,
              averageAllowanceMs: routeEligibleOrders.length ? average(routeEligibleOrders.map((order) => order.flowAllowanceMs)) : 0,
            };
          })
          .sort((a, b) => b.analysisSampleCount - a.analysisSampleCount || b.orderCount - a.orderCount || a.routeLabel.localeCompare(b.routeLabel, "zh-Hant"));

        const searchText = normalizeSearchText(
          [
            normalizedProductSpec,
            sortedOrders[0] && sortedOrders[0].productSpec,
            ...sortedOrders.map((order) => order.workOrderNo),
          ]
            .filter(Boolean)
            .join(" ")
        );

        return {
          productGroupKey,
          normalizedProductSpec,
          productSpec: sortedOrders[0] && sortedOrders[0].productSpec ? sortedOrders[0].productSpec : normalizedProductSpec,
          orderCount: sortedOrders.length,
          analysisSampleCount: eligibleOrders.length,
          totalQuantity: quantitySummary.hasQuantity ? quantitySummary.totalQuantity : null,
          totalQuantityText: formatProductFlowQuantity(quantitySummary.hasQuantity ? quantitySummary.totalQuantity : null),
          machineColumns,
          transitionColumns,
          displayColumns,
          routeGroups,
          orders: orderRows,
          machineAverages,
          transitionAverages,
          averageTotalProcessingMs: eligibleOrders.length ? average(eligibleOrders.map((order) => order.totalProcessingMs)) : 0,
          averageUnitProcessingMs: calculateWeightedUnitProcessingMs(sortedOrders),
          averageTotalWaitingMs: eligibleOrders.length ? average(eligibleOrders.map((order) => order.totalWaitingMs)) : 0,
          averageLeadTimeMs: eligibleOrders.length ? average(eligibleOrders.map((order) => normalizeDuration(order.totalProcessingMs) + normalizeDuration(order.totalWaitingMs))) : 0,
          averageAllowanceMs: eligibleOrders.length
            ? average(eligibleOrders.map((order) => calculateWidenedDuration(order.totalProcessingMs)))
            : 0,
          searchText,
        };
      })
      .filter((group) => !keyword || group.searchText.includes(keyword))
      .sort((a, b) => a.productSpec.localeCompare(b.productSpec, "zh-Hant"));
  }

  function getProductFlowColumnHeader(column) {
    if (!column) {
      return "";
    }
    return column.type === "machine" ? column.label : `等待(${column.label})`;
  }

  function buildProductFlowRouteTableModel(routeGroup) {
    const headerColumns = [
      { type: "fixed", key: "workOrderNo", headerLabel: "製令單號（數量）" },
      ...(routeGroup.displayColumns || []).map((column) => ({
        ...column,
        headerLabel: getProductFlowColumnHeader(column),
      })),
      { type: "fixed", key: "totalProcessingMs", headerLabel: "總工時" },
      { type: "fixed", key: "unitProcessingMs", headerLabel: "單件工時" },
      { type: "fixed", key: "totalWaitingMs", headerLabel: "總等待時間" },
      { type: "fixed", key: "flowAllowanceMs", headerLabel: "總時間(含寬放1.3)" },
    ];

    const machineAverageMap = new Map((routeGroup.machineAverages || []).map((item) => [item.machineKey, item.averageMs]));
    const waitingAverageMap = new Map((routeGroup.waitingAverages || []).map((item) => [item.transitionKey, item.averageMs]));

    const bodyRows = (routeGroup.orders || []).map((order) =>
      headerColumns.map((column) => {
        if (column.key === "workOrderNo") {
          return formatWorkOrderWithQuantity(order.workOrderNo, order.quantity, order.unit);
        }
        if (column.key === "totalProcessingMs") {
          return formatDuration(order.totalProcessingMs);
        }
        if (column.key === "unitProcessingMs") {
          return formatOptionalDuration(order.unitProcessingMs);
        }
        if (column.key === "totalWaitingMs") {
          return formatDuration(order.totalWaitingMs);
        }
        if (column.key === "flowAllowanceMs") {
          return formatDuration(order.flowAllowanceMs);
        }
        if (column.type === "machine") {
          return formatDuration(order.machineCellMap.get(column.machineKey) || 0);
        }
        if (column.type === "waiting") {
          return formatDuration(order.transitionCellMap.get(column.transitionKey) || 0);
        }
        return "";
      })
    );

    const footerRows = [
      {
        label: "分析樣本數",
        cells: headerColumns.map((column, index) => {
          if (index === 0) {
            return "分析樣本數";
          }
          if (column.key === "totalProcessingMs") {
            return `${routeGroup.analysisSampleCount} 筆`;
          }
          return "—";
        }),
      },
      {
        label: "平均加工時間",
        cells: headerColumns.map((column, index) => {
          if (index === 0) {
            return "平均加工時間";
          }
          if (column.type === "machine") {
            return formatDuration(machineAverageMap.get(column.machineKey) || 0);
          }
          if (column.key === "totalProcessingMs") {
            return formatDuration(routeGroup.averageTotalProcessingMs);
          }
          return "—";
        }),
      },
      {
        label: "平均單件工時",
        cells: headerColumns.map((column, index) => {
          if (index === 0) {
            return "平均單件工時";
          }
          if (column.key === "unitProcessingMs") {
            return formatOptionalDuration(routeGroup.averageUnitProcessingMs);
          }
          return "—";
        }),
      },
      {
        label: "平均等待時間",
        cells: headerColumns.map((column, index) => {
          if (index === 0) {
            return "平均等待時間";
          }
          if (column.type === "waiting") {
            return formatDuration(waitingAverageMap.get(column.transitionKey) || 0);
          }
          if (column.key === "totalWaitingMs") {
            return formatDuration(routeGroup.averageTotalWaitingMs);
          }
          return "—";
        }),
      },
      {
        label: "平均總工時 / 平均總等待時間 / 平均總時間(含寬放)",
        cells: headerColumns.map((column, index) => {
          if (index === 0) {
            return "平均總工時 / 平均總等待時間 / 平均總時間(含寬放)";
          }
          if (column.key === "totalProcessingMs") {
            return formatDuration(routeGroup.averageTotalProcessingMs);
          }
          if (column.key === "totalWaitingMs") {
            return formatDuration(routeGroup.averageTotalWaitingMs);
          }
          if (column.key === "flowAllowanceMs") {
            return formatDuration(routeGroup.averageAllowanceMs);
          }
          return "—";
        }),
      },
    ];

    return {
      headerColumns,
      bodyRows,
      footerRows,
    };
  }

  function buildProductFlowExportSheets(groups) {
    const detailRows = [];
    const summaryRows = [];
    const detailRowRoles = [];
    const summaryRowRoles = [];

    (groups || []).forEach((group) => {
      detailRows.push([`品名規格：${group.productSpec}`]);
      detailRowRoles.push("title");
      detailRows.push([
        `製令單筆數：${group.orderCount} 筆`,
        `分析樣本數：${group.analysisSampleCount} 筆`,
        `累計生產數量：${group.totalQuantityText}`,
        `平均總工時：${formatDuration(group.averageTotalProcessingMs)}`,
        `平均單件工時：${formatOptionalDuration(group.averageUnitProcessingMs)}`,
        `平均等待時間：${formatDuration(group.averageTotalWaitingMs)}`,
        `平均LeadTime：${formatDuration(group.averageLeadTimeMs)}`,
        `平均總時間(含寬放1.3)：${formatDuration(group.averageAllowanceMs)}`,
      ]);
      detailRowRoles.push("kpi");
      summaryRows.push([`品名規格：${group.productSpec}`]);
      summaryRowRoles.push("title");
      summaryRows.push([
        `製令單筆數：${group.orderCount} 筆`,
        `分析樣本數：${group.analysisSampleCount} 筆`,
        `累計生產數量：${group.totalQuantityText}`,
        `平均總工時：${formatDuration(group.averageTotalProcessingMs)}`,
        `平均單件工時：${formatOptionalDuration(group.averageUnitProcessingMs)}`,
        `平均等待時間：${formatDuration(group.averageTotalWaitingMs)}`,
        `平均LeadTime：${formatDuration(group.averageLeadTimeMs)}`,
        `平均總時間(含寬放1.3)：${formatDuration(group.averageAllowanceMs)}`,
      ]);
      summaryRowRoles.push("kpi");

      (group.routeGroups || []).forEach((routeGroup) => {
        const tableModel = buildProductFlowRouteTableModel(routeGroup);
        const headerRow = tableModel.headerColumns.map((column) => column.headerLabel);

        detailRows.push([`流程：${routeGroup.routeLabel}`]);
        detailRowRoles.push("route");
        detailRows.push(headerRow);
        detailRowRoles.push("header");
        tableModel.bodyRows.forEach((row) => {
          detailRows.push(row);
          detailRowRoles.push("body");
        });
        tableModel.footerRows.forEach((row) => {
          detailRows.push(row.cells);
          detailRowRoles.push("footer");
        });
        detailRows.push([]);
        detailRowRoles.push("blank");

        summaryRows.push([`流程：${routeGroup.routeLabel}`]);
        summaryRowRoles.push("route");
        summaryRows.push(headerRow);
        summaryRowRoles.push("header");
        tableModel.bodyRows.forEach((row) => {
          summaryRows.push(row);
          summaryRowRoles.push("body");
        });
        tableModel.footerRows.forEach((row) => {
          summaryRows.push(row.cells);
          summaryRowRoles.push("footer");
        });
        summaryRows.push([]);
        summaryRowRoles.push("blank");
      });

      detailRows.push([]);
      detailRowRoles.push("blank");
      summaryRows.push([]);
      summaryRowRoles.push("blank");
    });

    return {
      detailRows: {
        rows: detailRows,
        rowRoles: detailRowRoles,
        styledKind: "productFlow",
      },
      summaryRows: {
        rows: summaryRows,
        rowRoles: summaryRowRoles,
        styledKind: "productFlow",
      },
    };
  }

  function isDurationString(value) {
    return typeof value === "string" && /^\d+:\d{2}:\d{2}$/.test(value.trim());
  }

  function applyProductFlowSheetStyle(worksheet, rows, rowRoles) {
    if (!rows || !rows.length) {
      return;
    }

    const maxCols = rows.reduce((max, row) => Math.max(max, row.length), 0);
    const widths = new Array(maxCols).fill(10);
    const border = {
      top: { style: "thin", color: { argb: "FFD9B8D1" } },
      bottom: { style: "thin", color: { argb: "FFD9B8D1" } },
      left: { style: "thin", color: { argb: "FFD9B8D1" } },
      right: { style: "thin", color: { argb: "FFD9B8D1" } },
    };

    const roleStyles = {
      title: { fill: "FF5B3A8E", fontColor: "FFFFFFFF", bold: true, align: "left" },
      kpi: { fill: "FFEADCFB", fontColor: "FF4C1D95", bold: true, align: "left" },
      route: { fill: "FFF9D7D7", fontColor: "FF9F1239", bold: true, align: "left" },
      header: { fill: "FFF9D7E8", fontColor: "FF831843", bold: true, align: "center" },
      footer: { fill: "FFFCEAF2", fontColor: "FF6B214B", bold: false, align: "center" },
      body: { fill: null, fontColor: "FF334155", bold: false, align: "left" },
      blank: { fill: null, fontColor: "FF334155", bold: false, align: "left" },
    };

    rows.forEach((row, rowIndex) => {
      const role = rowRoles && rowRoles[rowIndex] ? rowRoles[rowIndex] : "body";
      const excelRow = worksheet.getRow(rowIndex + 1);
      const normalized = [...row];
      while (normalized.length < maxCols) {
        normalized.push("");
      }

      normalized.forEach((value, colIndex) => {
        const cell = excelRow.getCell(colIndex + 1);
        const text = value == null ? "" : String(value);
        cell.value = text;
        widths[colIndex] = Math.max(widths[colIndex], Math.min(text.length + 4, 42));

        const roleStyle = roleStyles[role] || roleStyles.body;
        const shouldCenter =
          role === "header" ||
          (role === "footer" && colIndex > 0) ||
          isDurationString(text) ||
          /筆$/.test(text) ||
          /^—$/.test(text);

        cell.font = {
          name: "Microsoft JhengHei",
          bold: roleStyle.bold,
          color: { argb: roleStyle.fontColor },
        };
        cell.alignment = {
          horizontal: shouldCenter ? "center" : roleStyle.align,
          vertical: "middle",
          wrapText: true,
        };
        cell.border = border;
        if (roleStyle.fill) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: roleStyle.fill },
          };
        }
      });

      if (role === "title" || role === "route") {
        worksheet.mergeCells(rowIndex + 1, 1, rowIndex + 1, maxCols);
      }
      excelRow.commit();
    });

    worksheet.views = [{ state: "frozen", xSplit: 0, ySplit: 4, topLeftCell: "A5" }];
    worksheet.columns = widths.map((wch) => ({ width: Math.max(wch, 12) }));
  }

  function calculateStationWaitingDetails(workOrders) {
    return (workOrders || [])
      .flatMap((order) =>
        (order.stationTransitions || []).map((transition) => ({
          workOrderNo: order.workOrderNo,
          productSpec: order.productSpec || "",
          valveType: order.valveType || "其他",
          machineLabel: transition.fromStation,
          nextMachineLabel: transition.toStation,
          startAt: transition.fromEndTime,
          endAt: transition.toStartTime,
          waitingMs: normalizeDuration(transition.waitingMs),
        }))
      )
      .filter((item) => item.machineLabel !== item.nextMachineLabel && item.waitingMs > 0)
      .sort((a, b) => b.waitingMs - a.waitingMs || a.workOrderNo.localeCompare(b.workOrderNo));
  }

  function buildLatestOperatorRecords(records) {
    const latest = new Map();
    const actions = new Set(["Start", "Pause", "Resume", "End"]);
    // Use all imported rows, including rows rejected by work-order validation.
    (records || []).forEach((record) => {
      const operator = cleanString(record.operator);
      const date = record.recordedAt;
      if (!operator || !actions.has(record.actionStatus) || !(date instanceof Date) || !Number.isFinite(date.getTime())) {
        return;
      }
      const previous = latest.get(operator);
      if (!previous || date.getTime() > previous.recordedAt.getTime()) {
        latest.set(operator, record);
      }
    });
    return latest;
  }

  function calculateOperatorSummary(workOrders, latestOperatorRecords = state.latestOperatorRecords) {
    const operatorMap = new Map();

    (workOrders || []).forEach((order) => {
      (order.stations || []).forEach((station) => {
        const operator = cleanString(station.operator);
        if (!operator || normalizeDuration(station.processingMs) <= 0) {
          return;
        }

        if (!operatorMap.has(operator)) {
          operatorMap.set(operator, {
            operator,
            totalProcessingMs: 0,
            segmentCount: 0,
            warningCount: 0,
            workOrders: new Set(),
            machines: new Set(),
            productSpecs: new Set(),
            records: [],
          });
        }

        const target = operatorMap.get(operator);
        const stationName = composeMachineLabel(station.machineId, station.machineName) || "未填機台";

        target.totalProcessingMs += normalizeDuration(station.processingMs);
        target.segmentCount += 1;
        target.workOrders.add(order.workOrderNo);
        target.machines.add(stationName);
        if (order.productSpec) {
          target.productSpecs.add(order.productSpec);
        }

        target.records.push({
          workOrderNo: order.workOrderNo,
          productSpec: order.productSpec || "未填品名規格",
          machineName: stationName,
          startAt: station.startAt,
          endAt: station.endAt,
          processingMs: normalizeDuration(station.processingMs),
          statusLabel: order.statusLabel,
          missedPauseWarning: station.missedPauseWarning || null,
        });

        if (station.missedPauseWarning) {
          target.warningCount += 1;
        }
      });
    });

    return Array.from(operatorMap.values())
      .map((item) => ({
        operator: item.operator,
        totalProcessingMs: item.totalProcessingMs,
        segmentCount: item.segmentCount,
        averageProcessingMs: item.segmentCount ? Math.round(item.totalProcessingMs / item.segmentCount) : 0,
        workOrderCount: item.workOrders.size,
        workOrderList: Array.from(item.workOrders).sort(),
        machineCount: item.machines.size,
        machineList: Array.from(item.machines).sort(),
        productSpecs: Array.from(item.productSpecs).sort(),
        warningCount: item.warningCount || 0,
        latestRecordAt: latestOperatorRecords.get(item.operator)?.recordedAt || null,
        records: item.records.sort((a, b) => {
          const aTime = a.endAt instanceof Date ? a.endAt.getTime() : a.startAt instanceof Date ? a.startAt.getTime() : 0;
          const bTime = b.endAt instanceof Date ? b.endAt.getTime() : b.startAt instanceof Date ? b.startAt.getTime() : 0;
          return bTime - aTime;
        }),
      }))
      .sort((a, b) => b.totalProcessingMs - a.totalProcessingMs || a.operator.localeCompare(b.operator, "zh-Hant"));
  }

  function calculateProductOperatorAnalysis(workOrders) {
    const productMap = new Map();

    (workOrders || []).forEach((order) => {
      const normalizedProductSpec = cleanString(order.normalizedProductSpec);
      const productGroupKey = getProductGroupKey(order);
      if (!normalizedProductSpec) {
        return;
      }

      if (!productMap.has(productGroupKey)) {
        productMap.set(productGroupKey, {
          productGroupKey,
          normalizedProductSpec,
          productSpec: order.productSpec || normalizedProductSpec,
          originalSpecs: new Set(),
          orderSet: new Set(),
          operatorMap: new Map(),
        });
      }

      const target = productMap.get(productGroupKey);
      if (order.productSpec) {
        (order.originalProductSpecs || [order.productSpec]).forEach((name) => target.originalSpecs.add(name));
      }
      target.orderSet.add(order.workOrderNo);

      (order.stations || []).forEach((station) => {
        const operator = cleanString(station.operator);
        if (!operator || normalizeDuration(station.processingMs) <= 0) {
          return;
        }

        if (!target.operatorMap.has(operator)) {
          target.operatorMap.set(operator, {
            operator,
            totalProcessingMs: 0,
            segmentCount: 0,
            warningCount: 0,
            machineSet: new Set(),
            workOrderSet: new Set(),
          });
        }

        const operatorTarget = target.operatorMap.get(operator);
        operatorTarget.totalProcessingMs += normalizeDuration(station.processingMs);
        operatorTarget.segmentCount += 1;
        operatorTarget.warningCount += station.missedPauseWarning ? 1 : 0;
        operatorTarget.workOrderSet.add(order.workOrderNo);
        operatorTarget.machineSet.add(composeMachineLabel(station.machineId, station.machineName) || "未填機台");
      });
    });

    return Array.from(productMap.values())
      .map((group) => ({
        normalizedProductSpec: group.normalizedProductSpec,
        productSpec: group.productSpec,
        orderCount: group.orderSet.size,
        originalSpecs: Array.from(group.originalSpecs).sort(),
        operators: Array.from(group.operatorMap.values())
          .map((item) => ({
            operator: item.operator,
            totalProcessingMs: item.totalProcessingMs,
            segmentCount: item.segmentCount,
            averageProcessingMs: item.segmentCount ? Math.round(item.totalProcessingMs / item.segmentCount) : 0,
            workOrderCount: item.workOrderSet.size,
            warningCount: item.warningCount || 0,
            machineList: Array.from(item.machineSet).sort(),
          }))
          .sort((a, b) => b.totalProcessingMs - a.totalProcessingMs || a.operator.localeCompare(b.operator, "zh-Hant")),
      }))
      .sort((a, b) => b.orderCount - a.orderCount || a.productSpec.localeCompare(b.productSpec, "zh-Hant"));
  }

  function calculateWorkOrderOperatorAnalysis(order) {
    const operatorMap = new Map();
    const sortedRecords = [...(order.rawRecords || [])].sort((a, b) => {
      const aTime = a.recordedAt instanceof Date ? a.recordedAt.getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.recordedAt instanceof Date ? b.recordedAt.getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });
    const firstEndRecord = sortedRecords.find((record) => record.actionStatus === "End") || null;

    function ensureOperator(operatorName, machineLabel) {
      const safeName = cleanString(operatorName) || "未填操作員";
      if (!operatorMap.has(safeName)) {
        operatorMap.set(safeName, {
          operator: safeName,
          totalProcessingMs: 0,
          segmentCount: 0,
          machineSet: new Set(),
          validWorkTime: false,
          hasAnomaly: false,
          notes: new Set(),
        });
      }
      const target = operatorMap.get(safeName);
      if (machineLabel) {
        target.machineSet.add(machineLabel);
      }
      return target;
    }

    (order.stations || []).forEach((station) => {
      const operator = cleanString(station.operator) || "未填操作員";
      const machineLabel = composeMachineLabel(station.machineId, station.machineName) || "未填機台";
      const target = ensureOperator(operator, machineLabel);
      const processingMs = normalizeDuration(station.processingMs);

      target.totalProcessingMs += processingMs;
      target.segmentCount += 1;
      target.validWorkTime = target.validWorkTime || processingMs > 0;

      if (order.hasAnomaly) {
        target.hasAnomaly = true;
        target.notes.add("流程異常，不納入計算");
      }
      if (station.missedPauseWarning) {
        target.validWorkTime = false;
        target.notes.add("⚠ 疑似漏按暫停，不納入平均");
      }
    });

    if (order.proxyEndInfo) {
      const target = ensureOperator(
        order.proxyEndInfo.endOperator,
        (order.machineWorkSummary && order.machineWorkSummary[order.machineWorkSummary.length - 1]?.stationName) || "未填機台"
      );
      target.hasAnomaly = true;
      target.notes.add("補按 End（不納入計算）");
    }

    sortedRecords.forEach((record) => {
      if (record.actionStatus !== "End" || !firstEndRecord || record === firstEndRecord) {
        return;
      }
      const machineLabel = composeMachineLabel(record.machineId, record.machineName) || "未填機台";
      const target = ensureOperator(record.operator, machineLabel);
      target.hasAnomaly = true;
      target.notes.add("重複 End（不納入計算）");
    });

    if (!operatorMap.size) {
      return [];
    }

    return Array.from(operatorMap.values())
      .map((item) => ({
        operator: item.operator,
        totalProcessingMs: item.totalProcessingMs,
        segmentCount: item.segmentCount,
        averageProcessingMs: item.segmentCount ? Math.round(item.totalProcessingMs / item.segmentCount) : 0,
        machineList: Array.from(item.machineSet).sort(),
        validWorkTime: item.validWorkTime && !order.hasAnomaly,
        hasAnomaly: item.hasAnomaly || order.hasAnomaly,
        noteText: Array.from(item.notes).join("；") || (item.validWorkTime ? "有效工時" : "不納入計算"),
      }))
      .sort((a, b) => b.totalProcessingMs - a.totalProcessingMs || a.operator.localeCompare(b.operator, "zh-Hant"));
  }

  function buildMachineUsageAnalysis(workOrders) {
    const now = new Date();
    const masterMap = new Map();
    (state.machineMaster || []).forEach((machine) => {
      const masterKey = cleanString(machine.masterKey) || resolveMachineMasterKey(machine.machineId, machine.machineName);
      if (!masterKey) {
        return;
      }
      masterMap.set(masterKey, {
        masterKey,
        machineId: cleanString(machine.machineId),
        machineName: cleanString(machine.machineName),
        label: composeMachineLabel(machine.machineId, machine.machineName) || masterKey,
        category: machine.category || classifyMachineCategory(machine.machineId, machine.machineName),
        totalProcessingMs: 0,
        totalWaitingMs: 0,
        completedOrderCount: 0,
        completedStationCount: 0,
        averageProcessingMs: 0,
        averageWaitingMs: 0,
        segmentCount: 0,
        transitionCount: 0,
        usedInCurrentRange: false,
        lastProcessedAt: machine.lastSeenAt ? parseDateTime(machine.lastSeenAt) : null,
        idleDays: null,
        status: "未使用",
      });
    });

    const waitingGroups = new Map();
    const processingGroups = new Map();

    (workOrders || []).forEach((order) => {
      const countedCompleted = new Set();

      (order.machineWorkSummary || []).forEach((machine) => {
        const masterKey = resolveMachineMasterKey(machine.machineId, machine.machineName) || cleanString(machine.machineKey);
        if (!masterKey) {
          return;
        }

        if (!masterMap.has(masterKey)) {
          masterMap.set(masterKey, {
            masterKey,
            machineId: cleanString(machine.machineId),
            machineName: cleanString(machine.machineName),
            label: composeMachineLabel(machine.machineId, machine.machineName) || masterKey,
            category: classifyMachineCategory(machine.machineId, machine.machineName),
            totalProcessingMs: 0,
            totalWaitingMs: 0,
            completedOrderCount: 0,
            completedStationCount: 0,
            averageProcessingMs: 0,
            averageWaitingMs: 0,
            segmentCount: 0,
            transitionCount: 0,
            usedInCurrentRange: false,
            lastProcessedAt: null,
            idleDays: null,
            status: "未使用",
          });
        }

        const target = masterMap.get(masterKey);
        const processingMs = normalizeDuration(machine.processingHours);
        target.totalProcessingMs += processingMs;
        target.totalWaitingMs += normalizeDuration(machine.waitingHours);
        target.segmentCount += (machine.segments || []).length || 0;
        target.usedInCurrentRange = target.usedInCurrentRange || processingMs > 0 || normalizeDuration(machine.waitingHours) > 0;
        target.lastProcessedAt = laterDate(target.lastProcessedAt, machine.endAt || null);

        if (!processingGroups.has(masterKey)) {
          processingGroups.set(masterKey, []);
        }
        if (processingMs > 0 && isEligibleAverageOrder(order) && !machine.hasMissedPauseWarning) {
          processingGroups.get(masterKey).push(processingMs);
        }

        if (order.completed && !order.hasAnomaly && !countedCompleted.has(masterKey)) {
          target.completedOrderCount += 1;
          countedCompleted.add(masterKey);
        }

        if (isCompletedMachineStage(order, machine)) {
          target.completedStationCount += 1;
        }
      });

      (order.stationTransitions || []).forEach((transition) => {
        const waitingMs = normalizeDuration(transition.waitingMs);
        if (!waitingMs) {
          return;
        }
        const masterKey = resolveMachineMasterKeyFromTransition(transition.fromMachineKey, transition.fromStation);
        if (!masterKey) {
          return;
        }
        if (!waitingGroups.has(masterKey)) {
          waitingGroups.set(masterKey, []);
        }
        waitingGroups.get(masterKey).push(waitingMs);
        const target = masterMap.get(masterKey);
        if (target) {
          target.transitionCount += 1;
        }
      });
    });

    const rows = Array.from(masterMap.values()).map((item) => {
      const processingSamples = processingGroups.get(item.masterKey) || [];
      const waitingSamples = waitingGroups.get(item.masterKey) || [];
      const lastProcessedAt = item.lastProcessedAt instanceof Date ? item.lastProcessedAt : null;
      const idleDays = calculateIdleDays(lastProcessedAt, now);
      const status = item.totalProcessingMs > 0 ? "使用中" : lastProcessedAt ? "閒置" : "未使用";
      return {
        ...item,
        averageProcessingMs: processingSamples.length ? average(processingSamples) : 0,
        averageWaitingMs: waitingSamples.length ? average(waitingSamples) : 0,
        lastProcessedAt,
        idleDays,
        status,
      };
    });

    const activeRows = rows.filter((item) => item.usedInCurrentRange);
    const totalProcessingMs = activeRows.reduce((sum, item) => sum + item.totalProcessingMs, 0);
    const rowsWithRate = rows.map((item) => ({
      ...item,
      usageRate: totalProcessingMs > 0 ? item.totalProcessingMs / totalProcessingMs : 0,
    }));

    const activeSortedByUsageDesc = [...activeRows]
      .map((item) => ({ ...item, usageRate: totalProcessingMs > 0 ? item.totalProcessingMs / totalProcessingMs : 0 }))
      .sort((a, b) => b.usageRate - a.usageRate || b.totalProcessingMs - a.totalProcessingMs || a.label.localeCompare(b.label, "zh-Hant"));
    const activeSortedByUsageAsc = [...activeSortedByUsageDesc].sort((a, b) => a.usageRate - b.usageRate || a.totalProcessingMs - b.totalProcessingMs || a.label.localeCompare(b.label, "zh-Hant"));
    const busyRows = [...rowsWithRate].sort((a, b) => b.totalProcessingMs - a.totalProcessingMs || a.label.localeCompare(b.label, "zh-Hant"));
    const idleRows = [...rowsWithRate].sort((a, b) => a.totalProcessingMs - b.totalProcessingMs || a.label.localeCompare(b.label, "zh-Hant"));
    const unusedRows = rowsWithRate.filter((item) => item.status === "未使用");
    const inactiveRows = rowsWithRate.filter((item) => item.status !== "使用中");
    const longestIdleRows = [...inactiveRows]
      .sort((a, b) => (b.idleDays ?? -1) - (a.idleDays ?? -1) || a.label.localeCompare(b.label, "zh-Hant"));

    const categoryMap = new Map();
    rowsWithRate.forEach((item) => {
      const category = item.category || "其他設備";
      if (!categoryMap.has(category)) {
        categoryMap.set(category, {
          category,
          machineCount: 0,
          activeMachineCount: 0,
          totalProcessingMs: 0,
          totalWaitingMs: 0,
          totalSegments: 0,
        });
      }
      const target = categoryMap.get(category);
      target.machineCount += 1;
      target.activeMachineCount += item.usedInCurrentRange ? 1 : 0;
      target.totalProcessingMs += item.totalProcessingMs;
      target.totalWaitingMs += item.totalWaitingMs;
      target.totalSegments += item.segmentCount;
    });

    return {
      masterCount: rows.length,
      activeCount: activeRows.length,
      totalProcessingMs,
      tableRows: rowsWithRate.sort((a, b) => b.totalProcessingMs - a.totalProcessingMs || a.label.localeCompare(b.label, "zh-Hant")),
      categoryRows: Array.from(categoryMap.values()).map((item) => ({
        ...item,
        usageRate: totalProcessingMs > 0 ? item.totalProcessingMs / totalProcessingMs : 0,
      })).sort((a, b) => b.totalProcessingMs - a.totalProcessingMs || a.category.localeCompare(b.category, "zh-Hant")),
      ranking: {
        highestUsage: activeSortedByUsageDesc[0] || null,
        lowestUsage: activeSortedByUsageAsc[0] || null,
        busiest: busyRows[0] || null,
        idlest: longestIdleRows[0] || idleRows[0] || null,
        longestUnused: longestIdleRows[0] || null,
      },
      usageRankRows: activeSortedByUsageDesc.slice(0, 10),
      highLoadRows: busyRows.filter((item) => item.totalProcessingMs > 0).slice(0, 10),
      lowUsageRows: activeSortedByUsageAsc.slice(0, 10),
      unusedRows: unusedRows.slice(0, 20),
      longestIdleRows: longestIdleRows.slice(0, 20),
    };
  }

  function buildMachineKeyDiagnostics(workOrders, machineMetrics, machineUsageAnalysis, targetMachineIds) {
    const ids = (targetMachineIds || []).map((item) => cleanString(item)).filter(Boolean);
    if (!ids.length) {
      return [];
    }

    const masterTotalMap = new Map();
    (machineUsageAnalysis && machineUsageAnalysis.tableRows || []).forEach((item) => {
      const machineId = cleanString(item.machineId);
      if (!machineId || !ids.includes(machineId)) {
        return;
      }
      masterTotalMap.set(machineId, normalizeDuration(item.totalProcessingMs));
    });

    const rawKeyMap = new Map();
    (workOrders || []).forEach((order) => {
      (order.machineWorkSummary || []).forEach((machine) => {
        const machineId = resolveMachineMasterKey(machine.machineId, machine.machineName);
        if (!machineId || !ids.includes(machineId)) {
          return;
        }
        const machineKey = cleanString(machine.machineKey) || getMachineKey(machine.machineId, machine.machineName) || machineId;
        const rawKey = `${machineId}::${machineKey}`;
        if (!rawKeyMap.has(rawKey)) {
          rawKeyMap.set(rawKey, {
            machineId,
            machineKey,
            label: machine.stationName || composeMachineLabel(machine.machineId, machine.machineName) || machineKey,
            processingMs: 0,
            segmentCount: 0,
            workOrderSet: new Set(),
          });
        }
        const target = rawKeyMap.get(rawKey);
        target.processingMs += normalizeDuration(machine.processingHours);
        target.segmentCount += (machine.segments || []).length || 0;
        if (order.workOrderNo) {
          target.workOrderSet.add(order.workOrderNo);
        }
      });
    });

    const metricKeyMap = new Map();
    (machineMetrics || []).forEach((item) => {
      const machineId = resolveMachineMasterKey(item.machineId, item.machineName);
      if (!machineId || !ids.includes(machineId)) {
        return;
      }
      const machineKey = cleanString(item.machineKey) || getMachineKey(item.machineId, item.machineName) || machineId;
      metricKeyMap.set(`${machineId}::${machineKey}`, item);
    });

    return ids.map((machineId) => {
      const keyRows = Array.from(rawKeyMap.values())
        .filter((item) => item.machineId === machineId)
        .map((item) => {
          const metric = metricKeyMap.get(`${machineId}::${item.machineKey}`);
          return {
            machineKey: item.machineKey,
            label: metric && metric.label ? metric.label : item.label,
            processingMs: metric ? normalizeDuration(metric.processingMs) : normalizeDuration(item.processingMs),
            workOrderCount: metric && Number.isFinite(metric.orderCount) ? metric.orderCount : item.workOrderSet.size,
            segmentCount: item.segmentCount,
          };
        })
        .sort((a, b) => b.processingMs - a.processingMs || a.machineKey.localeCompare(b.machineKey, "zh-Hant"));

      const metricTotalProcessingMs = keyRows.reduce((sum, item) => sum + normalizeDuration(item.processingMs), 0);
      const usageTotalProcessingMs = normalizeDuration(masterTotalMap.get(machineId) || 0);

      return {
        machineId,
        usageTotalProcessingMs,
        metricTotalProcessingMs,
        matchesUsageTotal: usageTotalProcessingMs === metricTotalProcessingMs,
        keyRows,
      };
    });
  }

  function isCompletedMachineStage(order, machine) {
    if (!machine || !normalizeDuration(machine.processingHours)) {
      return false;
    }

    if (machine.endStatus === "End") {
      return true;
    }

    if ((machine.transitions || []).length > 0) {
      return true;
    }

    const machineRoute = Array.isArray(order && order.machineRoute) ? order.machineRoute : [];
    const lastMachine = machineRoute.length ? machineRoute[machineRoute.length - 1] : "";
    if (order && order.completed && lastMachine && lastMachine === machine.stationName) {
      return true;
    }

    return false;
  }

  function materializeRange(range, records) {
    if (range && range.start && range.end) {
      return {
        label: range.label || formatRangeLabel(range),
        start: range.start,
        end: range.end,
      };
    }

    const validTimes = (records || [])
      .map((record) => (record.recordedAt instanceof Date ? record.recordedAt.getTime() : NaN))
      .filter((value) => Number.isFinite(value));

    if (!validTimes.length) {
      return {
        label: range && range.label ? range.label : "全部",
        start: null,
        end: null,
      };
    }

    return {
      label: range && range.label ? range.label : "全部",
      start: startOfDay(new Date(Math.min(...validTimes))),
      end: endOfDay(new Date(Math.max(...validTimes))),
    };
  }

  function buildMachineMetrics(workOrders, records, range) {
    const effectiveRange = materializeRange(range, records);
    const machineAverageMap = calculateMachineAverageHours(workOrders);
    const recordMap = new Map();
    (records || []).forEach((record) => {
      const machineKey = getMachineKey(record.machineId, record.machineName);
      if (!machineKey) {
        return;
      }
      if (!recordMap.has(machineKey)) {
        recordMap.set(machineKey, []);
      }
      recordMap.get(machineKey).push(record);
    });

    const machineMap = new Map();
    workOrders.forEach((order) => {
      (order.machineWorkSummary || []).forEach((station) => {
        const machineKey = station.machineKey || getMachineKey(station.machineId, station.machineName);
        if (!machineKey) {
          return;
        }
        if (!machineMap.has(machineKey)) {
          machineMap.set(machineKey, {
            machineKey,
            machineId: station.machineId || "",
            machineName: station.machineName || "",
            label: composeMachineLabel(station.machineId, station.machineName) || machineKey,
            processingMs: 0,
            waitingMs: 0,
            orderCount: 0,
          });
        }
        const target = machineMap.get(machineKey);
        target.processingMs += normalizeDuration(station.processingHours);
        target.waitingMs += normalizeDuration(station.waitingHours);
        target.orderCount += 1;
      });
    });

    return Array.from(machineMap.values())
      .map((item) => {
        const machineRecords = recordMap.get(item.machineKey) || [];
        const availability = calculateMachineRangeAvailability(effectiveRange, machineRecords);
        const utilizationWithHoliday = calculateRatio(item.processingMs, availability.availableWithHolidayMs);
        const utilizationWithoutHoliday = calculateRatio(item.processingMs, availability.availableWithoutHolidayMs);
        return {
          ...item,
          averageProcessingMs: machineAverageMap.get(item.machineKey)?.averageProcessingMs || 0,
          completedSampleCount: machineAverageMap.get(item.machineKey)?.sampleCount || 0,
          availableHoursWithHolidayMs: availability.availableWithHolidayMs,
          availableHoursWithoutHolidayMs: availability.availableWithoutHolidayMs,
          utilizationWithHoliday: typeof utilizationWithHoliday === "number" ? utilizationWithHoliday : 0,
          utilizationWithoutHoliday: typeof utilizationWithoutHoliday === "number" ? utilizationWithoutHoliday : 0,
        };
      })
      .sort((a, b) => (b.utilizationWithoutHoliday || 0) - (a.utilizationWithoutHoliday || 0) || a.label.localeCompare(b.label));
  }

  function calculateMachineAverageHours(workOrders) {
    const groups = new Map();

    (workOrders || [])
      .filter((order) => isEligibleAverageOrder(order))
      .forEach((order) => {
        (order.machineWorkSummary || []).forEach((item) => {
          if (!item.machineKey || !normalizeDuration(item.processingHours) || item.hasMissedPauseWarning) {
            return;
          }
          if (!groups.has(item.machineKey)) {
            groups.set(item.machineKey, []);
          }
          groups.get(item.machineKey).push(normalizeDuration(item.processingHours));
        });
      });

    const result = new Map();
    groups.forEach((values, key) => {
      result.set(key, {
        averageProcessingMs: average(values),
        sampleCount: values.length,
      });
    });
    return result;
  }

  function applyScopedMachineUtilization(workOrders, machineMetrics, range) {
    const metricMap = new Map((machineMetrics || []).map((item) => [item.machineKey, item]));
    workOrders.forEach((order) => {
      const orderMachineKeys = Array.from(new Set((order.machineKeys || []).filter((key) => metricMap.has(key))));
      const availableHoursWithHolidayMs = orderMachineKeys.reduce((sum, key) => sum + normalizeDuration(metricMap.get(key).availableHoursWithHolidayMs), 0);
      const availableHoursWithoutHolidayMs = orderMachineKeys.reduce((sum, key) => sum + normalizeDuration(metricMap.get(key).availableHoursWithoutHolidayMs), 0);
      const utilizationWithHoliday = calculateRatio(order.totalProcessingMs, availableHoursWithHolidayMs);
      const utilizationWithoutHoliday = calculateRatio(order.totalProcessingMs, availableHoursWithoutHolidayMs);

      order.availableHoursWithHolidayMs = availableHoursWithHolidayMs;
      order.availableHoursWithoutHolidayMs = availableHoursWithoutHolidayMs;
      order.processingHoursMs = normalizeDuration(order.totalProcessingMs);
      order.utilizationWithHoliday = typeof utilizationWithHoliday === "number" ? utilizationWithHoliday : 0;
      order.utilizationWithoutHoliday = typeof utilizationWithoutHoliday === "number" ? utilizationWithoutHoliday : 0;
      order.includeInUtilizationAverage = !!(order.completed && !order.hasAnomaly && order.processingHoursMs > 0 && orderMachineKeys.length);
      order.utilizationNote = buildUtilizationNote(order, orderMachineKeys.length, range);

      (order.stations || []).forEach((station) => {
        const metric = metricMap.get(getMachineKey(station.machineId, station.machineName));
        station.machineAvailableWithHolidayMs = metric ? normalizeDuration(metric.availableHoursWithHolidayMs) : 0;
        station.machineAvailableWithoutHolidayMs = metric ? normalizeDuration(metric.availableHoursWithoutHolidayMs) : 0;
        station.machineUtilizationWithHoliday = metric ? metric.utilizationWithHoliday : 0;
        station.machineUtilizationWithoutHoliday = metric ? metric.utilizationWithoutHoliday : 0;
        station.machineStandardHours = metric ? normalizeDuration(metric.averageProcessingMs) : 0;
      });

      (order.stationAnalysis || []).forEach((station) => {
        const metric = metricMap.get(station.machineKey);
        station.machineAvailableWithHolidayMs = metric ? normalizeDuration(metric.availableHoursWithHolidayMs) : 0;
        station.machineAvailableWithoutHolidayMs = metric ? normalizeDuration(metric.availableHoursWithoutHolidayMs) : 0;
        station.machineUtilizationWithHoliday = metric ? metric.utilizationWithHoliday : 0;
        station.machineUtilizationWithoutHoliday = metric ? metric.utilizationWithoutHoliday : 0;
        station.machineStandardHours = metric ? normalizeDuration(metric.averageProcessingMs) : 0;
      });
    });
  }

  function buildUtilizationNote(order, machineCount, range) {
    if (!machineCount) {
      return "目前區間沒有機台可用工時資料，因此利用率顯示 0%。";
    }
    if (!order.completed) {
      return "尚未 End，先顯示目前區間的機台利用率。";
    }
    if (order.hasAnomaly) {
      return "此工單含異常資料，利用率只供參考，不納入平均。";
    }
    return `依目前查詢區間 ${formatRangeLabel(range)}、每日 ${state.utilizationConfig.dailyHours} 小時、${state.utilizationConfig.excludeHolidays ? "排除未開工假日" : "包含假日"}，共統計 ${machineCount} 台機台。`;
  }

  function calculateMachineRangeAvailability(range, records) {
    if (!range || !(range.start instanceof Date) || !(range.end instanceof Date) || range.end.getTime() < range.start.getTime()) {
      return {
        availableWithHolidayMs: 0,
        availableWithoutHolidayMs: 0,
      };
    }

    const dailyAvailableMs = getConfiguredDailyAvailableMs();
    let cursor = startOfDay(range.start);
    let availableWithHolidayMs = 0;
    let availableWithoutHolidayMs = 0;

    while (cursor.getTime() <= range.end.getTime()) {
      const dayStart = cursor;
      const dayEnd = endOfDay(cursor);
      const overlapStart = new Date(Math.max(range.start.getTime(), dayStart.getTime()));
      const overlapEnd = new Date(Math.min(range.end.getTime(), dayEnd.getTime()));
      const overlapMs = Math.max(overlapEnd.getTime() - overlapStart.getTime(), 0);

      if (overlapMs > 0) {
        availableWithHolidayMs += dailyAvailableMs;
        if (!isHoliday(dayStart) || hasWorkOnHoliday(records || [], dayStart)) {
          availableWithoutHolidayMs += dailyAvailableMs;
        }
      }

      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    }

    return {
      availableWithHolidayMs,
      availableWithoutHolidayMs,
    };
  }

  function buildWaitingAnalytics(workOrders, machineMetrics) {
    const stationDetails = calculateStationWaitingDetails(workOrders);
    const machineWaitingMap = new Map();
    const valveWaitingMap = new Map();

    stationDetails.forEach((detail) => {
      const valveType = detail.valveType || "其他";
      machineWaitingMap.set(detail.machineLabel, (machineWaitingMap.get(detail.machineLabel) || 0) + normalizeDuration(detail.waitingMs));
      if (!valveWaitingMap.has(valveType)) {
        valveWaitingMap.set(valveType, []);
      }
      valveWaitingMap.get(valveType).push(normalizeDuration(detail.waitingMs));
    });

    return {
      stationDetails,
      machineWaitingRank: mapAndSortNumeric(machineWaitingMap),
      stationWaitingRank: stationDetails
        .filter((item) => item.waitingMs > 0)
        .sort((a, b) => b.waitingMs - a.waitingMs || a.workOrderNo.localeCompare(b.workOrderNo))
        .slice(0, 10),
      valveWaitingRank: Array.from(valveWaitingMap.entries())
        .map(([label, values]) => ({ label, value: average(values), count: values.length }))
        .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label)),
      longestWaitingOrders: [...workOrders]
        .filter((order) => order.totalWaitingMs > 0)
        .sort((a, b) => b.totalWaitingMs - a.totalWaitingMs || a.workOrderNo.localeCompare(b.workOrderNo))
        .slice(0, 10),
      machineUtilizationRank: [...(machineMetrics || [])].map((item) => ({
        label: item.label,
        value: state.utilizationConfig.excludeHolidays ? item.utilizationWithoutHoliday : item.utilizationWithHoliday,
        processingMs: item.processingMs,
        waitingMs: item.waitingMs,
        averageProcessingMs: item.averageProcessingMs,
        availableHoursMs: state.utilizationConfig.excludeHolidays ? item.availableHoursWithoutHolidayMs : item.availableHoursWithHolidayMs,
        availableHoursWithHolidayMs: item.availableHoursWithHolidayMs,
        utilizationWithHoliday: item.utilizationWithHoliday,
      })),
    };
  }

  function getScopedData(rangeOverride) {
    const activeRange = rangeOverride || resolveActiveDateRange();
    const archiveData = state.archiveData || {
      activeRecords: state.validRecords,
      archivedByYear: {},
      archivedOrdersByYear: {},
      archiveSummary: [],
    };
    const selectedArchiveYear = cleanString(state.selectedArchiveYear);
    const includedArchiveRecords = state.includeArchiveInAnalysis && selectedArchiveYear && archiveData.archivedByYear[selectedArchiveYear]
      ? archiveData.archivedByYear[selectedArchiveYear]
      : [];
    const baseRecords = state.includeArchiveInAnalysis
      ? [...(archiveData.activeRecords || []), ...includedArchiveRecords]
      : archiveData.activeRecords || state.validRecords;
    const allValidBaseRecords = state.validRecords || [];
    const cacheKey = `${serializeRange(activeRange)}::${baseRecords.length}::${allValidBaseRecords.length}::${selectedArchiveYear}::${state.includeArchiveInAnalysis ? "includeArchive" : "activeOnly"}::${state.utilizationConfig.dailyHours}::${state.utilizationConfig.excludeHolidays ? "exclude" : "keep"}`;
    if (state.rangeCache.has(cacheKey)) {
      return state.rangeCache.get(cacheKey);
    }

    const filteredRecords = filterByDateRange(baseRecords, activeRange);
    const workOrders = buildWorkOrders(filteredRecords);
    const analysisRecords = filterByDateRange(allValidBaseRecords, activeRange);
    const analysisWorkOrders = buildWorkOrders(analysisRecords);
    const effectiveRange = materializeRange(activeRange, filteredRecords);
    const machineMetrics = buildMachineMetrics(workOrders, filteredRecords, effectiveRange);
    applyScopedMachineUtilization(workOrders, machineMetrics, effectiveRange);
    const standards = buildStandards(analysisWorkOrders);
    const scheduleRows = buildScheduleRows(workOrders, standards);
    const comparisons = buildProductSpecComparisons(analysisWorkOrders);
    const waitingAnalytics = buildWaitingAnalytics(workOrders, machineMetrics);
    const machineUsageAnalysis = buildMachineUsageAnalysis(workOrders);
    const operatorSummaries = calculateOperatorSummary(workOrders);
    const productOperatorGroups = calculateProductOperatorAnalysis(workOrders);
    const productFlowAnalysis = buildProductSpecFlowAnalysis(analysisWorkOrders, state.productFlowSearchTerm);

    const scoped = {
      range: activeRange,
      effectiveRange,
      sourceRecords: baseRecords,
      filteredRecords,
      workOrders,
      analysisSourceRecords: allValidBaseRecords,
      analysisFilteredRecords: analysisRecords,
      analysisWorkOrders,
      machineMetrics,
      standards,
      scheduleRows,
      comparisons,
      productFlowAnalysis,
      waitingAnalytics,
      machineUsageAnalysis,
      operatorSummaries,
      productOperatorGroups,
      archiveData,
      selectedArchiveYear,
      includedArchiveRecords,
      includeArchiveInAnalysis: state.includeArchiveInAnalysis,
    };
    state.rangeCache.set(cacheKey, scoped);
    return scoped;
  }

  function renderAll() {
    const scoped = getScopedData();
    const view = getFilteredView(scoped);
    syncRangeInputs(scoped.range);
    renderRangeLabel(scoped.range);
    renderFilterState(view, scoped);
    renderSummary(view, scoped);
    renderInvalidRecordsSection();
    renderRawReportingSection();
    renderProductClassification();
    renderHistoricalSetupSection();
    renderArchiveSection(scoped);
    renderMessage();
    renderFlowTable(view);
    renderStandardTable(view);
    renderScheduleTable(view);
    renderWaitingAnalytics(view);
    renderMissedPauseAnalysisSection(view);
    renderMachineUsageSection(view);
    renderComparisonSection(view);
    renderProductFlowAnalysisSection(view);
    renderProductOperatorSection(view);
    renderOperatorSummarySection(view);
    renderOperatorDetailSection(view);
  }

  function getFilteredView(scoped) {
    const keyword = normalizeSearchText(state.searchTerm);
    const filteredWorkOrders = scoped.workOrders.filter((order) => matchesStatusFilter(order) && matchesSearchKeyword(order, keyword));
    const filteredRecords = filteredWorkOrders.flatMap((order) => order.rawRecords || []);
    const filteredAnalysisWorkOrders = (scoped.analysisWorkOrders || []).filter((order) => matchesStatusFilter(order) && matchesSearchKeyword(order, keyword));
    const filteredMachineMetrics = buildMachineMetrics(filteredWorkOrders, filteredRecords, scoped.effectiveRange);
    const filteredStandards = buildStandards(filteredAnalysisWorkOrders);
    const filteredScheduleRows = buildScheduleRows(filteredWorkOrders, filteredStandards);
    const filteredComparisons = buildProductSpecComparisons(filteredAnalysisWorkOrders);
    const filteredProductFlowAnalysis = buildProductSpecFlowAnalysis(filteredAnalysisWorkOrders, state.productFlowSearchTerm);
    const filteredWaitingAnalytics = buildWaitingAnalytics(filteredWorkOrders, filteredMachineMetrics);
    const filteredMachineUsageAnalysis = buildMachineUsageAnalysis(filteredWorkOrders);
    const filteredMissedPauseAnalysis = buildMissedPauseAnalysis(filteredAnalysisWorkOrders);
    const filteredOperatorSummaries = calculateOperatorSummary(filteredWorkOrders);
    const filteredProductOperatorGroups = calculateProductOperatorAnalysis(filteredWorkOrders);
    const utilizationSummary = buildUtilizationSummary(filteredWorkOrders, filteredMachineMetrics, scoped.effectiveRange);

    const operatorNames = filteredOperatorSummaries.map((item) => item.operator);
    if (state.selectedOperator && !operatorNames.includes(state.selectedOperator)) {
      state.selectedOperator = operatorNames[0] || "";
    }
    if (!state.selectedOperator && operatorNames.length) {
      state.selectedOperator = operatorNames[0];
    }
    const selectedOperatorSummary = filteredOperatorSummaries.find((item) => item.operator === state.selectedOperator) || null;

    return {
      filteredWorkOrders,
      filteredAnalysisWorkOrders,
      filteredMachineMetrics,
      filteredStandards,
      filteredScheduleRows,
      filteredComparisons,
      filteredProductFlowAnalysis,
      filteredWaitingAnalytics,
      filteredMachineUsageAnalysis,
      filteredMissedPauseAnalysis,
      filteredOperatorSummaries,
      filteredProductOperatorGroups,
      selectedOperatorSummary,
      utilizationSummary,
    };
  }

  function renderFilterState(view, scoped) {
    const resultNote = document.getElementById("filterResultNote");
    const labelMap = {
      all: "全部資料",
      completed: "只看已完成",
      incomplete: "只看未完成",
      anomaly: "只看異常資料",
    };
    const keyword = cleanString(state.searchTerm);
    const sourceLabel = scoped.includeArchiveInAnalysis && scoped.selectedArchiveYear
      ? `主資料 + ${scoped.selectedArchiveYear}年度歷史資料`
      : "主資料";
    resultNote.textContent = `目前顯示 ${view.filteredWorkOrders.length} / ${scoped.workOrders.length} 張製令單｜Lead Time ${view.filteredStandards.length} 筆｜排程預估 ${view.filteredScheduleRows.length} 筆｜篩選：${labelMap[state.statusFilter] || "全部資料"}｜分析來源：${sourceLabel}${keyword ? `｜搜尋：${keyword}` : ""}`;

    Array.from(document.querySelectorAll("[data-status-filter]")).forEach((button) => {
      button.classList.toggle("is-active", button.dataset.statusFilter === state.statusFilter);
    });
    Array.from(document.querySelectorAll("[data-range-preset]")).forEach((button) => {
      button.classList.toggle("is-active", button.dataset.rangePreset === state.dateFilter.preset);
    });
  }

  function renderSummary(view, scoped) {
    const summaryGrid = document.getElementById("summaryGrid");
    const completedCount = view.filteredWorkOrders.filter((item) => item.completed).length;
    const incompleteCount = view.filteredWorkOrders.filter((item) => !item.completed && !item.hasAnomaly).length;
    const anomalyCount = view.filteredWorkOrders.filter((item) => item.hasAnomaly).length;
    const totalProcessingMs = view.filteredWorkOrders.reduce((sum, item) => sum + item.totalProcessingMs, 0);
    const totalWaitingMs = view.filteredWorkOrders.reduce((sum, item) => sum + item.totalWaitingMs, 0);
    const utilization = view.utilizationSummary;
    const missedPauseCount = (view.filteredMissedPauseAnalysis && view.filteredMissedPauseAnalysis.warningRows ? view.filteredMissedPauseAnalysis.warningRows.length : 0);

    summaryGrid.innerHTML = [
      buildSummaryCard("資料來源", escapeHtml(state.sourceLabel || "尚未載入資料"), state.sourceLabel ? "目前顯示的是已載入資料。" : "請上傳 Excel / CSV 或貼上 TSV。"),
      buildSummaryCard("機台啟停原始筆數", String(state.rawRows.length || 0), "匯入前的原始啟停紀錄數量"),
      buildSummaryCard("機台啟停有效筆數", String(state.validRecords.length || 0), state.invalidRecords.length
        ? `<button type="button" class="summary-detail-link" data-invalid-records-link aria-controls="invalid-records-details" title="查看全部無效資料明細">無效資料 ${state.invalidRecords.length} 筆</button>`
        : "無效資料 0 筆"),
      buildSummaryCard("目前顯示製令單", String(view.filteredWorkOrders.length || 0), `全部資料 ${scoped.workOrders.length || 0} 張`),
      buildSummaryCard("已完成數", String(completedCount || 0), `未完成 ${incompleteCount} 張｜異常 ${anomalyCount} 張`),
      buildSummaryCard("總加工工時", formatDuration(totalProcessingMs), "目前篩選區間內的總加工工時"),
      buildSummaryCard("總等待時間", formatDuration(totalWaitingMs), "只統計跨機台的站間等待"),
      buildSummaryCard("疑似漏按暫停", String(missedPauseCount || 0), "點擊可查看明細與人員排行", "missed-pause-analysis"),
      buildSummaryCard("平均機台利用率", formatPercentage(utilization.averageUtilization), `共統計 ${utilization.machineSampleCount} 台機台`),
      buildSummaryCard("本期間機台利用率", formatPercentage(utilization.currentRangeUtilization), `區間：${utilization.rangeLabel}`),
      buildSummaryCard("含假日利用率", formatPercentage(utilization.withHolidayUtilization), "可用工時包含假日"),
      buildSummaryCard("不含假日利用率", formatPercentage(utilization.withoutHolidayUtilization), "可用工時排除未開工假日"),
      buildSummaryCard("全部資料數", String(scoped.workOrders.length || 0), "可搭配搜尋與篩選查看"),
    ].join("");
  }

  function renderInvalidRecordsSection() {
    const container = document.getElementById("invalidRecordsTable");
    if (!state.invalidRecords.length) {
      container.innerHTML = '<div class="empty-card">目前沒有無效資料。</div>';
      return;
    }

    // Read rejected values from the original row for display only, without revalidating them.
    const originalValue = (record, field) => {
      const entry = Object.entries(record.originalRow || {}).find(([key]) => findMappedField(normalizeHeader(key)) === field);
      return entry ? displayValue(entry[1]) : "—";
    };
    container.innerHTML = `
      <p>無效資料共 ${state.invalidRecords.length} 筆</p>
      <div class="table-shell nested-table-shell">
        <table>
          <thead><tr><th>原始資料列</th><th>製令單號</th><th>品名規格</th><th>使用者</th><th>機台</th><th>原始動作</th><th>原始紀錄時間</th><th>無效原因</th></tr></thead>
          <tbody>${state.invalidRecords.map((record) => `
            <tr>
              <td>${escapeHtml(record.id)}</td>
              <td>${escapeHtml(record.workOrderNo || "—")}</td>
              <td>${escapeHtml(record.productSpec || "—")}</td>
              <td>${escapeHtml(record.operator || "—")}</td>
              <td>${escapeHtml(composeMachineLabel(record.machineId, record.machineName) || "—")}</td>
              <td>${escapeHtml(originalValue(record, "actionStatus"))}</td>
              <td>${escapeHtml(originalValue(record, "recordedAt"))}</td>
              <td>${escapeHtml(record.invalidReason || "必要欄位缺漏")}</td>
            </tr>`).join("")}</tbody>
        </table>
      </div>`;
  }

  function renderRawReportingSection() {
    const [headers, ...rows] = buildRawReportingSheet(state.rawRows);
    const filters = state.rawReportingFilters;
    const keyword = normalizeSearchText(filters.searchTerm);
    const searchColumns = ["製令單號", "設備編號", "品名規格", "使用者"].map((label) => headers.indexOf(label));
    const actionColumn = headers.indexOf("動作狀態");
    // Normalize only for matching. Display and export retain the original field values.
    const matchedRows = rows.filter((row) =>
      (!keyword || searchColumns.some((index) => normalizeSearchText(row[index]).includes(keyword))) &&
      (filters.actionStatus === "all" || normalizeStatus(row[actionColumn]) === filters.actionStatus)
    );
    const pageCount = Math.max(1, Math.ceil(matchedRows.length / RAW_REPORTING_PAGE_SIZE));
    filters.page = Math.max(1, Math.min(filters.page, pageCount));
    const start = (filters.page - 1) * RAW_REPORTING_PAGE_SIZE;
    const pageRows = matchedRows.slice(start, start + RAW_REPORTING_PAGE_SIZE);
    const rangeLabel = matchedRows.length ? `本頁顯示第 ${start + 1}–${start + pageRows.length} 筆` : "本頁顯示 0 筆";
    document.getElementById("rawReportingResultNote").textContent = `原始紀錄共 ${rows.length} 筆；符合篩選 ${matchedRows.length} 筆；${rangeLabel}。`;
    document.getElementById("exportRawReportingBtn").disabled = rows.length === 0;
    document.getElementById("rawReportingPagination").hidden = pageCount <= 1;
    document.getElementById("rawReportingPageLabel").textContent = `第 ${filters.page} / ${pageCount} 頁`;
    document.getElementById("rawReportingPrevBtn").disabled = filters.page <= 1;
    document.getElementById("rawReportingNextBtn").disabled = filters.page >= pageCount;
    document.getElementById("rawReportingTable").innerHTML = pageRows.length ? `
      <div class="table-shell raw-reporting-table-shell" tabindex="0" role="region" aria-label="原始報工紀錄表格，可捲動查看所有欄位">
        <table aria-label="原始報工紀錄">
          <thead><tr>${headers.map((header) => `<th scope="col">${escapeHtml(header)}</th>`).join("")}</tr></thead>
          <tbody>${pageRows.map((row) => `<tr>${row.map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("")}</tbody>
        </table>
      </div>` : `<div class="empty-card">${rows.length ? "沒有符合搜尋與動作篩選的原始紀錄，請調整或清除篩選。" : "尚未匯入資料。請上傳 Excel / CSV 或貼上資料後查看原始報工紀錄。"}</div>`;
  }

  function setupQuantile(values, fraction) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const position = (sorted.length - 1) * fraction;
    const lower = Math.floor(position);
    return sorted[lower] + (sorted[Math.ceil(position)] - sorted[lower]) * (position - lower);
  }

  function summarizeSetupSamples(samples) {
    const values = samples.map((sample) => sample.effectiveMs);
    const q1 = setupQuantile(values, 0.25);
    const q3 = setupQuantile(values, 0.75);
    const upperFenceMs = values.length >= 4 ? q3 + 1.5 * (q3 - q1) : null;
    const adoptedSamples = samples.filter((sample) => upperFenceMs == null || sample.effectiveMs <= upperFenceMs);
    const adoptedValues = adoptedSamples.map((sample) => sample.effectiveMs);
    return {
      samples: adoptedSamples,
      outliers: samples.filter((sample) => !adoptedSamples.includes(sample)),
      upperFenceMs,
      medianMs: setupQuantile(adoptedValues, 0.5),
      averageMs: adoptedValues.length ? adoptedValues.reduce((sum, value) => sum + value, 0) / adoptedValues.length : null,
      minMs: adoptedValues.length ? Math.min(...adoptedValues) : null,
      maxMs: adoptedValues.length ? Math.max(...adoptedValues) : null,
    };
  }

  function getSetupOfficialYear(year, calendar) {
    // Derived from complete 365-row DGPA CSVs, not recurring festival dates.
    // Ordinary Saturdays are handled by attendance, separately from named holidays.
    const published = {
      2025: { path: "202510/b84cb88a-803c-4621-a843-d637b2775615.csv", dates: "0101 0127 0128 0129 0130 0131 0228 0403 0404 0530 0531 0928 0929 1006 1010 1024 1025 1225" },
      2026: { path: "202506/a52331bd-a189-466b-b0f0-cae3062bbf74.csv", dates: "0101 0215 0216 0217 0218 0219 0220 0227 0228 0403 0404 0405 0406 0501 0619 0925 0928 1009 1010 1025 1026 1225" },
      2027: { path: "202607/f538b1ff-ba60-4c63-9477-10db8e6612d1.csv", dates: "0101 0204 0205 0206 0207 0208 0209 0210 0228 0301 0404 0405 0406 0430 0501 0609 0915 0928 1010 1011 1025 1224 1225 1231" },
    };
    const imported = (calendar.officialYears || {})[year];
    if (imported && imported.complete) return imported;
    const data = published[year];
    return data ? { complete: true, rowCount: 365, source: `https://www.dgpa.gov.tw/FileConversion?filename=dgpa/files/${data.path}&nfix=`,
      holidays: data.dates.split(" ").map((value) => `${year}-${value.slice(0, 2)}-${value.slice(2)}`) } : null;
  }

  function mergeSetupIntervals(intervals) {
    const merged = [];
    intervals.filter(([start, end]) => end > start).sort((a, b) => a[0] - b[0]).forEach(([start, end]) => {
      const last = merged[merged.length - 1];
      if (last && start <= last[1]) last[1] = Math.max(last[1], end);
      else merged.push([start, end]);
    });
    return merged;
  }

  function parseSetupIntervals(text, allowEmpty = false) {
    if (text.trim() === "休" || (allowEmpty && !text.trim())) return [];
    const intervals = text.split(/[;；]/).map((part) => {
      const match = part.trim().match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/);
      if (!match) throw new Error("時段請使用 HH:mm-HH:mm，多段以分號分隔；不出勤填 休。");
      const [, h1, m1, h2, m2] = match.map(Number);
      const start = h1 * 60 + m1, end = h2 * 60 + m2;
      if (h1 > 23 || m1 > 59 || h2 > 24 || m2 > 59 || (h2 === 24 && m2) || end <= start) throw new Error("時段無效或時間倒置；跨夜出勤請分日期輸入。");
      return [start, end];
    });
    return mergeSetupIntervals(intervals);
  }

  function parseSetupCalendarEntries(text, field) {
    const seen = new Set();
    return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const [date, name, ranges, ...extra] = line.split(/[,，]/).map((value) => value.trim());
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || formatDateInput(parseDateOnly(date)) !== date || !name || !ranges || extra.length) throw new Error("出勤／例外格式請用 日期,人員或機台,時段。");
      const key = JSON.stringify([date, name]);
      if (seen.has(key)) throw new Error("同日期同人員／機台不可重複，請合併為同一列多個時段。");
      seen.add(key);
      return { date, [field]: name, intervals: parseSetupIntervals(ranges) };
    });
  }

  function buildSetupOfficialCalendar(rows, source) {
    const byYear = {};
    rows.forEach((row) => {
      const value = String(row.西元日期 || "").replace(/[-/]/g, "");
      const code = String(row.是否放假);
      if (!/^\d{8}$/.test(value) || !["0", "2"].includes(code)) throw new Error("日曆需含西元日期及是否放假（0 / 2）。");
      const key = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}`;
      const date = parseDateOnly(key);
      if (!date || formatDateInput(date) !== key) throw new Error("日曆日期無效。");
      const year = date.getFullYear();
      if (!byYear[year]) byYear[year] = { dates: new Set(), holidays: [], complete: true, source };
      const group = byYear[year];
      if (group.dates.has(key)) throw new Error("日曆有重複日期，未套用。");
      group.dates.add(key);
      if (code === "2" && (![0, 6].includes(date.getDay()) || cleanString(row.備註))) group.holidays.push(key);
    });
    if (!Object.keys(byYear).length) throw new Error("日曆沒有資料。");
    Object.entries(byYear).forEach(([year, group]) => {
      let count = 0;
      for (let day = new Date(Number(year), 0, 1); day.getFullYear() === Number(year); day.setDate(day.getDate() + 1)) {
        count += 1;
        if (!group.dates.has(formatDateInput(day))) throw new Error(`${year} 年日曆不完整，日曆資料未確認；原設定未變更。`);
      }
      group.rowCount = count;
      delete group.dates;
    });
    return byYear;
  }

  async function importSetupOfficialCalendar(event) {
    const file = event.target.files[0];
    if (!file) return;
    const message = document.getElementById("setupCalendarMessage");
    try {
      const book = window.XLSX.read(await decodeTextFile(file), { type: "string", raw: true });
      const years = buildSetupOfficialCalendar(window.XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: "" }), `人工匯入官方 CSV：${file.name}`);
      commitSetupCalendar({ ...state.setupCalendar, officialYears: { ...state.setupCalendar.officialYears, ...years } },
        `已匯入完整年度：${Object.keys(years).join("、")}。請確認檔案來自官方最新公告；政府日曆不等於實際出勤。`);
    } catch (error) { message.textContent = error.message || "日曆匯入失敗，原設定未變更。"; }
    event.target.value = "";
  }

  function calculateSetupCalendarGap(startAt, endAt, machineId, calendar, operators = [], operatorEvents = new Map()) {
    const deductions = { holiday: 0, sunday: 0, saturday: 0, nonWorking: 0, break: 0, unconfirmedCalendar: 0 };
    const pending = new Set(), saturdayStatus = new Set(), calendarSources = new Set(), dayDetails = [];
    const names = [...new Set(operators.map((operator) => cleanString(operator)))];
    const work = calendar.workIntervals || [[480, 1020]];
    const breaks = calendar.breakIntervals || [[600, 615], [720, 780], [900, 915]];
    let effectiveMs = 0, calendarConfirmed = true;
    if (!startAt || !endAt || endAt <= startAt) return { effectiveMs, deductions, calendarConfirmed: false, calendarStatus: "時間錯亂／待確認", confirmationStatus: "待確認", confirmationReasons: ["候選時間無效"], saturdayStatus: "不適用", pendingReasons: ["候選時間無效"], dayDetails, calendarSources: [] };
    const find = (items, field, name, key) => (items || []).find((item) => item.date === key && item[field] === name)
      || (items || []).find((item) => item.date === key && item[field] === "*");
    const inside = (minute, intervals) => intervals.some(([start, end]) => minute >= start && minute < end);
    for (let day = startOfDay(startAt); day < endAt; day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)) {
      const key = formatDateInput(day), base = day.getTime();
      const start = Math.max(startAt.getTime(), base), end = Math.min(endAt.getTime(), new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime());
      const official = getSetupOfficialYear(day.getFullYear(), calendar);
      if (!official) { calendarConfirmed = false; pending.add(`${day.getFullYear()} 年日曆資料未確認`); }
      else calendarSources.add(official.source);
      const holiday = !!(official && official.holidays.includes(key)) || (calendar.holidays || []).includes(key);
      const saturday = day.getDay() === 6;
      const machineOff = (calendar.machineDaysOff || []).some((item) => [machineId, "*"].includes(item.machineId) && item.date === key);
      const machineOverride = find(calendar.machineOverrides, "machineId", machineId, key);
      const people = (names.length ? names : [""]).map((name) => {
        const attendance = find(calendar.attendance, "operator", name, key);
        const override = find(calendar.operatorOverrides, "operator", name, key);
        const entry = attendance || override;
        if (saturday) {
          const evidence = (operatorEvents.get(name) || []).some((event) => formatDateInput(event.time) === key);
          saturdayStatus.add(`${key} ${name || "人員不明"}：${entry ? `${attendance ? "出勤紀錄" : "人工確認"}（${entry.intervals.length ? "已確認時段" : "未出勤"}）` : evidence ? "有出勤證據／出勤時段未確認" : "出勤未確認"}`);
          if (!entry) pending.add(`${key} 週六出勤時段未確認`);
        }
        return { explicit: !!entry, intervals: entry ? entry.intervals : official && !holiday && !saturday ? work : [] };
      });
      const boundaries = new Set([start, end]);
      [...work, ...breaks, ...people.flatMap((person) => person.intervals), ...(machineOverride ? machineOverride.intervals : [])].forEach((range) => range.forEach((minute) => {
        const time = base + minute * 60000;
        if (time > start && time < end) boundaries.add(time);
      }));
      const points = [...boundaries].sort((a, b) => a - b);
      const totals = { effective: 0 };
      for (let i = 1; i < points.length; i += 1) {
        const ms = points[i] - points[i - 1], minute = ((points[i] + points[i - 1]) / 2 - base) / 60000;
        let bucket = "effective";
        // Exclusive attribution keeps raw = effective + all deductions, even on overlapping holidays.
        if (day.getDay() === 0) bucket = "sunday";
        else if (!official && !people.every((person) => person.explicit)) bucket = "unconfirmedCalendar";
        else if (holiday && !people.every((person) => person.explicit && inside(minute, person.intervals))) bucket = "holiday";
        else if (saturday && people.some((person) => !person.explicit || !inside(minute, person.intervals))) bucket = "saturday";
        else if (machineOff || !people.every((person) => inside(minute, person.intervals)) || (machineOverride && !inside(minute, machineOverride.intervals))) bucket = "nonWorking";
        else if (inside(minute, breaks)) bucket = "break";
        if (bucket === "effective") effectiveMs += ms;
        else deductions[bucket] += ms;
        totals[bucket] = (totals[bucket] || 0) + ms;
      }
      dayDetails.push({ date: key, ...totals });
    }
    return { effectiveMs, deductions, calendarConfirmed, factoryCalendarConfirmed: !!calendar.confirmed, calendarStatus: calendarConfirmed ? "政府年度日曆已確認；工廠例外另行核對" : "日曆資料未確認",
      ...describeSetupCalendarConfirmation(dayDetails, machineId, calendar, names, [...pending]),
      saturdayStatus: [...saturdayStatus].join("；") || "未跨週六", pendingReasons: [...pending], dayDetails, calendarSources: [...calendarSources] };
  }

  function describeSetupCalendarConfirmation(days, machineId, calendar, operators, pendingReasons) {
    // Evidence labels are deliberately separate from deductions and statistical eligibility.
    const pending = new Set(pendingReasons), defaults = new Set();
    const names = [...new Set(operators)];
    const find = (items, field, name, date) => (items || []).find((item) => item.date === date && item[field] === name)
      || (items || []).find((item) => item.date === date && item[field] === "*");
    let confirmedDays = 0;
    if (!names.length || names.some((name) => !name)) pending.add("缺少操作員，無法核對實際出勤");
    days.forEach((day) => {
      const date = parseDateOnly(day.date);
      const official = getSetupOfficialYear(date.getFullYear(), calendar);
      if (!official) pending.add(`${date.getFullYear()} 年日曆資料未確認`);
      const attendance = names.map((name) => find(calendar.attendance, "operator", name, day.date));
      const overrides = names.map((name) => find(calendar.operatorOverrides, "operator", name, day.date));
      // Fixed Sundays and fully excluded official holidays do not require working-hour evidence.
      if (date.getDay() === 0 || (date.getDay() !== 6 && day.holiday && !day.effective && !attendance.some(Boolean) && !overrides.some(Boolean))) return;
      if (attendance.length && attendance.every(Boolean)) {
        const machine = find(calendar.machineOverrides, "machineId", machineId, day.date);
        const off = (calendar.machineDaysOff || []).some((item) => [machineId, "*"].includes(item.machineId) && item.date === day.date);
        if (machine || off) confirmedDays += 1;
        else pending.add(`${day.date} 有實際出勤，但缺少機台 ${machineId} 工作時段／停工資料`);
      } else if (date.getDay() === 6) {
        pending.add(`${day.date} 週六缺少完整實際出勤佐證（人工例外不等於出勤表）`);
      } else if (attendance.some(Boolean) || overrides.some(Boolean)) {
        pending.add(`${day.date} 僅有部分人員出勤或人工例外，尚未完整核實`);
      } else {
        defaults.add("缺少實際出勤表，依系統預設班別及休息時段推估；非已確認出勤");
      }
    });
    const confirmationStatus = pending.size ? "待確認" : defaults.size || !confirmedDays ? "預設班別推估" : "已確認";
    return { confirmationStatus, confirmationReasons: [...pending, ...defaults,
      ...(!pending.size && !defaults.size ? [confirmedDays ? "相關工作日的實際人員出勤及必要機台工作資料齊全；仍非實測換模" : "依預設休息日規則排除，沒有實際出勤佐證"] : [])] };
  }

  function setupCalendarStatusCounts(samples) {
    const counts = { 已確認: 0, 預設班別推估: 0, 待確認: 0 };
    samples.forEach((sample) => { counts[sample.calendarGap.confirmationStatus || "待確認"] += 1; });
    return counts;
  }

  function setupCalendarStatusSummary(samples) {
    return Object.entries(setupCalendarStatusCounts(samples)).map(([label, count]) => `${label}：${count}`).join("；");
  }

  function calculateSetupWorkingMs(startAt, endAt, machineId, calendar) {
    return calculateSetupCalendarGap(startAt, endAt, machineId, calendar).effectiveMs;
  }

  function parseSetupTimestamp(value) {
    if (value == null || value === "") return null;
    const date = parseDateTime(value);
    if (!date || Number.isNaN(date.getTime())) return null;
    if (typeof value === "string") {
      // Reject missing times and rolled-over calendar dates without altering MES's existing parser.
      const text = toHalfWidth(value);
      const parts = text.match(/^(\d{4})[\/.-年](\d{1,2})[\/.-月](\d{1,2})/);
      if (!/\d{1,2}:\d{2}/.test(text)) return null;
      if (parts && (date.getFullYear() !== Number(parts[1]) || date.getMonth() + 1 !== Number(parts[2]) || date.getDate() !== Number(parts[3]))) return null;
    }
    return date;
  }

  function normalizeSetupAction(value) {
    // Match reporting actions only; "換模開始" is not a machining Start.
    const token = normalizeLooseText(value).toLowerCase().replace(/[\s/()[\]:：_-]/g, "");
    const actions = [["Start", "開始"], ["Pause", "暫停"], ["Resume", "恢復"], ["End", "結束"]];
    return (actions.find(([action, label]) => [action.toLowerCase(), label, `${label}${action.toLowerCase()}`, `${action.toLowerCase()}${label}`].includes(token)) || [""])[0];
  }

  function compareSetupEvents(a, b) {
    return a.time - b.time || String(a.machineId || "").localeCompare(String(b.machineId || ""))
      || String(a.order || "").localeCompare(String(b.order || "")) || a.action.localeCompare(b.action)
      || String(a.operator || "").localeCompare(String(b.operator || ""));
  }

  function buildSetupOperatorEvidence(from, to, operatorEvents) {
    const previousOperator = from.operator;
    const nextOperator = to.operator;
    const sameOperator = previousOperator && nextOperator ? previousOperator === nextOperator : null;
    const names = [...new Set([previousOperator, nextOperator].filter(Boolean))];
    const during = names.flatMap((name) => operatorEvents.get(name) || []).filter((event) => event.time > from.time && event.time < to.time);
    const otherMachineWorkEvents = during.filter((event) => event.machineId && event.machineId !== from.machineId);
    const otherMachineIntervals = [];
    names.forEach((name) => {
      const opened = new Map();
      (operatorEvents.get(name) || []).forEach((event) => {
        if (!event.machineId || event.machineId === from.machineId) return;
        if (["Start", "Resume"].includes(event.action)) {
          const active = opened.get(event.machineId);
          opened.set(event.machineId, active ? { ...event, uncertain: true } : event);
        } else if (event.action === "Pause") {
          const active = opened.get(event.machineId);
          opened.delete(event.machineId);
          if (!active || active.uncertain || active.duplicate || event.duplicate || active.order !== event.order || event.time <= active.time) return;
          const start = new Date(Math.max(from.time.getTime(), active.time.getTime()));
          const end = new Date(Math.min(to.time.getTime(), event.time.getTime()));
          if (end > start) otherMachineIntervals.push({ operator: name, machineId: event.machineId, order: event.order,
            startAt: active.time, endAt: event.time, overlapStart: start, overlapEnd: end, overlapMs: end - start });
        }
      });
    });
    const unknownMachineEventCount = during.filter((event) => !event.machineId).length;
    const operatorWorkedOtherMachine = otherMachineWorkEvents.length > 0 || otherMachineIntervals.length > 0;
    const operatorScenario = sameOperator == null ? "unknown" : !sameOperator ? "B" : operatorWorkedOtherMachine ? "C" : unknownMachineEventCount ? "unknown" : "A";
    const operatorEvidenceLabel = {
      A: "同一人，期間未見他機報工", B: "不同人接手", C: "同一人，期間有他機報工", unknown: "人員或期間機台資訊不足",
    }[operatorScenario];
    const operatorConfidence = { A: "較高", B: "中等", C: "較低", unknown: "資料不足" }[operatorScenario];
    return { previousOperator, nextOperator, sameOperator, operatorWorkedOtherMachine, otherMachineWorkCount: otherMachineWorkEvents.length,
      otherMachineWorkMinutes: otherMachineIntervals.length ? mergeSetupIntervals(otherMachineIntervals.map((item) => [+item.overlapStart, +item.overlapEnd])).reduce((sum, [start, end]) => sum + end - start, 0) / 60000 : null,
      otherMachineWorkEvents, otherMachineIntervals, unknownMachineEventCount, operatorScenario, operatorEvidenceLabel, operatorConfidence };
  }

  function buildHistoricalSetupAnalysis(rawRows, calendar = state.setupCalendar) {
    const [headers, ...sheetRows] = buildRawReportingSheet(rawRows);
    const column = (label) => headers.indexOf(label);
    const valveColumn = headers.findIndex((header) => ["閥類", "閥門類型", "valvetype", "valve_type"].includes(normalizeHeader(header)));
    const diagnostics = { rawEventCount: sheetRows.length, parsedTimeCount: 0, pauseCount: 0, startCount: 0, resumeCount: 0, endCount: 0, skippedEventCount: 0, switchCount: 0, missingPauseCount: 0, missingActivationCount: 0 };
    const events = [];
    const pairingIssues = [], incompleteEvents = [], uniqueEvents = new Map();
    const operatorEvents = new Map();
    sheetRows.forEach((row, index) => {
      const action = normalizeSetupAction(row[column("動作狀態")]);
      const time = parseSetupTimestamp(row[column("紀錄時間")]);
      const countKey = { Pause: "pauseCount", Start: "startCount", Resume: "resumeCount", End: "endCount" }[action];
      if (countKey) diagnostics[countKey] += 1;
      if (time) diagnostics.parsedTimeCount += 1;
      const machineId = cleanString(row[column("設備編號")]);
      const order = cleanString(row[column("製令單號")]);
      const operatorName = cleanString(row[column("使用者")]);
      const operator = /^(未填操作員|未知|—|-)$/u.test(operatorName) ? "" : operatorName;
      if (!time || !machineId || !order || !action) {
        diagnostics.skippedEventCount += 1;
        const issue = { machineId, order, operator, time, rowNumber: index + 2, action: row[column("動作狀態")],
          reason: [!time ? "時間無法解析／缺少時間" : "", !machineId ? "機台資料不完整" : "", !order ? "缺少製令單" : "", !action ? "非加工 Start / Pause / Resume / End（不參與配對）" : ""].filter(Boolean).join("；") };
        pairingIssues.push(issue);
        if (action && action !== "End") incompleteEvents.push(issue);
        if (time && operator && ["Start", "Pause", "Resume"].includes(action)) {
          if (!operatorEvents.has(operator)) operatorEvents.set(operator, []);
          operatorEvents.get(operator).push({ ...issue, action, machineName: cleanString(row[column("設備名稱")]) });
        }
        return;
      }
      const product = cleanString(row[column("品名規格")]);
      const productKey = normalizeProductSpec(product) || `@order:${order}`;
      const event = { index, rowNumber: index + 2, time, action, machineId, order, product, productKey, operator,
        requiredPart: cleanString(row[column("需求料件")]),
        machineName: cleanString(row[column("設備名稱")]), valve: valveColumn >= 0 ? cleanString(row[valveColumn]) : "",
        fault: column("故障說明") >= 0 ? cleanString(row[column("故障說明")]) : "",
        identity: order, orderMachineKey: JSON.stringify([machineId, order]),
      };
      const duplicateKey = JSON.stringify([machineId, order, action, time.getTime()]);
      if (uniqueEvents.has(duplicateKey)) {
        uniqueEvents.get(duplicateKey).duplicate = true;
        pairingIssues.push({ ...event, reason: "重複報工事件／同時刻同機同單同動作，待確認" });
        return;
      }
      uniqueEvents.set(duplicateKey, event);
      events.push(event);
      if (operator && action !== "End") {
        if (!operatorEvents.has(operator)) operatorEvents.set(operator, []);
        operatorEvents.get(operator).push(event);
      }
    });
    events.sort(compareSetupEvents);
    operatorEvents.forEach((items) => items.sort(compareSetupEvents));
    const machines = new Map();
    const lastPause = new Map();
    const lastActivation = new Map();
    const orderActivations = new Map();
    events.forEach((event) => {
      if (event.action === "End") return;
      if (!machines.has(event.machineId)) machines.set(event.machineId, []);
      machines.get(event.machineId).push(event);
      if (event.action === "Pause") lastPause.set(event.orderMachineKey, event);
      else {
        lastActivation.set(event.orderMachineKey, event);
        if (!orderActivations.has(event.order)) orderActivations.set(event.order, []);
        orderActivations.get(event.order).push(event);
      }
    });
    const candidates = [];
    machines.forEach((machineEvents, machineId) => {
      const identitiesAtTime = new Map();
      const openOrders = new Map(), occupancy = [];
      events.filter((event) => event.machineId === machineId).forEach((event) => {
        if (["Start", "Resume"].includes(event.action)) {
          if (!openOrders.has(event.order)) openOrders.set(event.order, event);
        } else if (openOrders.has(event.order)) {
          // A late End or an unclosed event cannot prove continuous machine occupancy.
          if (event.action === "Pause") occupancy.push({ order: event.order, start: openOrders.get(event.order).time, end: event.time });
          openOrders.delete(event.order);
        }
      });
      const runs = [];
      machineEvents.forEach((event) => {
        const timestamp = event.time.getTime();
        if (!identitiesAtTime.has(timestamp)) identitiesAtTime.set(timestamp, new Set());
        identitiesAtTime.get(timestamp).add(JSON.stringify([event.order, event.action]));
        let run = runs[runs.length - 1];
        if (!run || run.identity !== event.identity) {
          run = { identity: event.identity, firstEvent: event, activation: null, pause: null, duplicate: false, open: false, overlapping: false };
          runs.push(run);
        }
        run.duplicate = run.duplicate || !!event.duplicate;
        if (event.action === "Pause") { run.pause = event; run.open = false; }
        else {
          if (run.open) run.overlapping = true;
          run.open = true;
          if (!run.activation) run.activation = event;
        }
      });
      for (let index = 1; index < runs.length; index += 1) {
        const previous = runs[index - 1];
        const next = runs[index];
        if (previous.firstEvent.order === next.firstEvent.order) continue;
        if (!next.activation) { diagnostics.missingActivationCount += 1; pairingIssues.push({ ...next.firstEvent, reason: "缺少下一製令單 Start / Resume，無法建立候選" }); continue; }
        diagnostics.switchCount += 1;
        if (!previous.pause) { diagnostics.missingPauseCount += 1; pairingIssues.push({ ...previous.firstEvent, reason: "缺少前製令單 Pause，不使用 End 替代／無法建立候選" }); continue; }
        const from = previous.pause;
        const to = next.activation;
        const reasons = [];
        if (lastPause.get(from.orderMachineKey) !== from) reasons.push("非前工單於本機台最後一筆 Pause");
        const returning = lastActivation.get(from.orderMachineKey);
        if (returning && returning.time >= from.time) reasons.push("交錯加工／待確認：前工單後續仍在同機台 Start / Resume，尚未最後離站");
        if (!previous.activation || previous.firstEvent.action === "Pause") reasons.push("前工單缺少 Pause 前的加工事件／待確認");
        if (previous.duplicate || next.duplicate) reasons.push("重複報工事件／待確認");
        if (previous.overlapping || next.overlapping) reasons.push("加工事件重疊：連續 Start / Resume 未見 Pause／待確認");
        if (occupancy.some((interval) => interval.order !== from.order && interval.start < to.time && interval.end > from.time && (interval.order !== to.order || interval.start < from.time))) reasons.push("同機台另有完整報工區間與候選重疊／待確認");
        if (incompleteEvents.some((event) => (!event.machineId || event.machineId === machineId) &&
          ([from.order, to.order].includes(event.order) || (event.machineId === machineId && (!event.time || (event.time >= previous.firstEvent.time && event.time <= to.time)))))) reasons.push("相關事件缺時間、機台或工單資料／待確認");
        if (next.firstEvent.action === "Pause") reasons.push("後工單先有 Pause，缺少首次進站時間");
        if (identitiesAtTime.get(from.time.getTime()).size > 1 || identitiesAtTime.get(to.time.getTime()).size > 1) reasons.push("同一時間有不同工單／動作，先後順序不明／待確認");
        if (!from.product || !to.product) reasons.push("缺少前後品名規格，無法確認產品切換");
        const crossDay = formatDateInput(from.time) !== formatDateInput(to.time);
        if (crossDay) reasons.push("跨日候選：可能包含隔夜等待，不納入代表值");
        if ([from.fault, to.fault].some((value) => value && !/^(無|無故障|正常|0|-)$/i.test(value))) reasons.push("端點含故障說明，無法視為純換模");
        const rawMs = to.time - from.time;
        const operatorEvidence = buildSetupOperatorEvidence(from, to, operatorEvents);
        const calendarGap = calculateSetupCalendarGap(from.time, to.time, machineId, calendar, [from.operator, to.operator], operatorEvents);
        const effectiveMs = calendarGap.effectiveMs;
        reasons.push(...calendarGap.pendingReasons);
        const possiblyNoSetup = !!from.requiredPart && from.requiredPart === to.requiredPart;
        if (possiblyNoSetup) reasons.push("可能不需換模：前後需求料件相同（保留候選，不進代表值，不代表 0 分鐘）");
        if (rawMs <= 0) reasons.push("非正時間差");
        if (effectiveMs <= 0) reasons.push("有效工作時間為 0（非工作時段／休息日）");
        else if (effectiveMs < 2 * 60000) reasons.push("疑似僅為報工切換時間（小於 2 分鐘）");
        const moved = (orderActivations.get(from.order) || []).find((event) => event.machineId !== machineId && event.time > from.time && event.time <= to.time);
        candidates.push({ id: `SETUP-${from.rowNumber}-${to.rowNumber}`, machineId, machineName: to.machineName || from.machineName,
          previousOrder: from.order, previousProduct: from.product, previousProductKey: from.productKey, previousValve: from.valve, pauseAt: from.time, pauseRow: from.rowNumber,
          nextOrder: to.order, nextProduct: to.product, nextProductKey: to.productKey, nextValve: to.valve, startAt: to.time, startAction: to.action, startRow: to.rowNumber,
          previousProductMovedToNextStation: !!moved, nextStationEvidence: moved ? `${composeMachineLabel(moved.machineId, moved.machineName)} ${formatDateTime(moved.time)}` : "",
          rawMs, effectiveMs, crossDay, exclusionReasons: [...new Set(reasons)], adopted: false,
          previousRequiredPart: from.requiredPart, nextRequiredPart: to.requiredPart, possiblyNoSetup, calendarGap,
          ...operatorEvidence,
          productGroupKey: JSON.stringify([machineId, from.productKey, to.productKey]),
          valveGroupKey: from.valve && to.valve ? JSON.stringify([machineId, normalizeSearchText(from.valve), normalizeSearchText(to.valve)]) : "",
        });
      }
    });
    const productGroups = new Map();
    candidates.forEach((sample) => {
      if (!productGroups.has(sample.productGroupKey)) productGroups.set(sample.productGroupKey, []);
      productGroups.get(sample.productGroupKey).push(sample);
    });
    const productStats = new Map();
    productGroups.forEach((samples, key) => {
      const stats = summarizeSetupSamples(samples.filter((sample) => !sample.exclusionReasons.length));
      stats.outliers.forEach((sample) => sample.exclusionReasons.push("產品切換 IQR：空檔超過 Q3 + 1.5 × IQR"));
      stats.samples.forEach((sample) => { sample.adopted = true; });
      productStats.set(key, stats);
    });
    const machinePools = new Map();
    candidates.filter((sample) => sample.adopted).forEach((sample) => {
      if (sample.previousProductKey !== sample.nextProductKey) {
        if (!machinePools.has(sample.machineId)) machinePools.set(sample.machineId, []);
        machinePools.get(sample.machineId).push(sample);
      }
    });
    const machineStats = new Map(Array.from(machinePools, ([key, samples]) => [key, summarizeSetupSamples(samples)]));
    const summaries = Array.from(productGroups, ([key, samples]) => {
      const first = samples[0];
      const product = productStats.get(key);
      const machine = machineStats.get(first.machineId);
      const possiblyNoSetupCount = samples.filter((sample) => sample.possiblyNoSetup).length;
      const machineReferenceSuppressed = possiblyNoSetupCount > 0;
      // Preserve legacy qualification; tiered presentation runs only after final adoption below.
      const selected = product.samples.length >= 5 ? { source: "product_transition", stats: product }
        : !machineReferenceSuppressed && machine && machine.samples.length ? { source: "machine_default", stats: machine } : null;
      const stats = selected ? selected.stats : summarizeSetupSamples([]);
      const count = stats.samples.length;
      let confidence = count >= 5 ? "可作為排程估計" : count >= 3 ? "初步參考" : count ? "低可信度" : machineReferenceSuppressed ? "可能不需換模／待確認" : "無歷史資料";
      if (!count && !machineReferenceSuppressed && samples.some((sample) => sample.effectiveMs > 0 && sample.effectiveMs < 2 * 60000)) confidence = "疑似僅為報工切換時間";
      return { key, machineId: first.machineId, machineName: first.machineName, previousProduct: first.previousProduct, nextProduct: first.nextProduct,
        previousValve: Array.from(new Set(samples.map((sample) => sample.previousValve).filter(Boolean))).join("、"),
        nextValve: Array.from(new Set(samples.map((sample) => sample.nextValve).filter(Boolean))).join("、"),
        candidateCount: samples.length, adoptedCount: samples.filter((sample) => sample.adopted).length,
        possiblyNoSetupCount, machineReferenceSuppressed,
        machineSampleCount: machine ? machine.samples.length : 0, machineMedianMs: machine ? machine.medianMs : null,
        productSampleCount: product.samples.length, productMedianMs: product.medianMs,
        productConfidence: product.samples.length >= 5 ? "可作為排程估計" : product.samples.length >= 3 ? "初步參考／歷史參考" : product.samples.length ? "低可信度／歷史參考" : "無有效產品樣本",
        referenceSampleCount: count, medianMs: stats.medianMs, averageMs: stats.averageMs, minMs: stats.minMs, maxMs: stats.maxMs,
        confidence, setupSource: selected ? selected.source : "no_history", usableForScheduling: count >= 5,
        referenceSamples: stats.samples, referenceOutliers: stats.outliers, upperFenceMs: stats.upperFenceMs,
        movedEvidenceCount: stats.samples.filter((sample) => sample.previousProductMovedToNextStation).length, samples,
      };
    }).sort((a, b) => b.candidateCount - a.candidateCount || a.machineId.localeCompare(b.machineId) || a.previousProduct.localeCompare(b.previousProduct));
    const productLevelAdoptedCount = candidates.filter((sample) => sample.adopted).length;
    const usedSampleIds = new Set(summaries.flatMap((group) => group.referenceSamples.map((sample) => sample.id)));
    const pooledOutlierIds = new Set([...machineStats.values()].flatMap((stats) => stats.outliers.map((sample) => sample.id)));
    candidates.forEach((sample) => {
      sample.productLevelAdopted = sample.adopted;
      if (sample.adopted && !usedSampleIds.has(sample.id)) {
        sample.adopted = false;
        sample.exclusionReasons.push(pooledOutlierIds.has(sample.id) ? "退回來源 IQR：空檔過長，未進入任何代表值" : "未進入代表值來源（機台共用層只採不同產品切換）");
      }
      sample.highConfidence = sample.adopted && sample.operatorScenario === "A" && sample.calendarGap.calendarConfirmed && !sample.calendarGap.pendingReasons.length;
    });
    summaries.forEach((group) => {
      const adopted = group.samples.filter((sample) => sample.adopted);
      group.adoptedCount = adopted.length;
      // Display the same final sample set as the product count, not pre-machine-IQR samples.
      group.productSampleCount = adopted.length;
      group.productMedianMs = setupQuantile(adopted.map((sample) => sample.effectiveMs), 0.5);
      applySetupTieredEstimate(group, candidates);
      group.highConfidenceCount = group.referenceSamples.filter((sample) => sample.highConfidence).length;
      group.highConfidenceMedianMs = setupQuantile(group.referenceSamples.filter((sample) => sample.highConfidence).map((sample) => sample.effectiveMs), 0.5);
      group.operatorEvidenceSummary = ["A", "B", "C", "unknown"].map((scenario) => `${scenario === "unknown" ? "資料不足" : scenario}：${group.referenceSamples.filter((sample) => sample.operatorScenario === scenario).length}`).join("；");
    });
    const machineSummaries = Array.from(machines.keys()).map((machineId) => {
      const samples = candidates.filter((sample) => sample.machineId === machineId);
      const valid = samples.filter((sample) => sample.adopted);
      const high = valid.filter((sample) => sample.highConfidence);
      return { machineId, machineName: machineEventsName(machineId), candidateCount: samples.length, adoptedCount: valid.length,
        excludedCount: samples.length - valid.length, highConfidenceCount: high.length,
        medianMs: setupQuantile(valid.map((sample) => sample.effectiveMs), 0.5), highConfidenceMedianMs: setupQuantile(high.map((sample) => sample.effectiveMs), 0.5),
        confidence: setupSampleGrade(valid.length) };
    }).filter((machine) => machine.candidateCount).sort((a, b) => a.machineId.localeCompare(b.machineId, "en", { numeric: true }));
    function machineEventsName(machineId) {
      const named = (machines.get(machineId) || []).find((event) => event.machineName);
      return named ? named.machineName : "";
    }
    const exclusionCounts = {};
    candidates.forEach((sample) => sample.exclusionReasons.forEach((reason) => { exclusionCounts[reason] = (exclusionCounts[reason] || 0) + 1; }));
    return { diagnostics: { ...diagnostics, candidateCount: candidates.length, excludedCount: candidates.filter((sample) => !sample.adopted).length,
      adoptedCount: candidates.filter((sample) => sample.adopted).length, productLevelAdoptedCount, productGroupCount: summaries.length,
      sameOperatorCount: candidates.filter((sample) => sample.sameOperator === true).length,
      differentOperatorCount: candidates.filter((sample) => sample.sameOperator === false).length,
      operatorWorkedOtherMachineCount: candidates.filter((sample) => sample.operatorWorkedOtherMachine).length,
      sameOperatorOtherMachineCount: candidates.filter((sample) => sample.operatorScenario === "C").length,
      unknownOperatorCount: candidates.filter((sample) => sample.operatorScenario === "unknown").length,
      highConfidenceCount: candidates.filter((sample) => sample.highConfidence).length, pairingIssueCount: pairingIssues.length,
      calendarStatusCounts: setupCalendarStatusCounts(candidates), adoptedCalendarStatusCounts: setupCalendarStatusCounts(candidates.filter((sample) => sample.adopted)) }, candidates, summaries, machineSummaries, exclusionCounts, calendar, pairingIssues };
  }

  function getHistoricalSetupAnalysis() {
    const calendarKey = JSON.stringify(state.setupCalendar);
    if (!state.setupAnalysisCache || state.setupAnalysisCache.rawRows !== state.rawRows || state.setupAnalysisCache.calendarKey !== calendarKey) {
      state.setupAnalysisCache = { rawRows: state.rawRows, calendarKey, result: buildHistoricalSetupAnalysis(state.rawRows, state.setupCalendar) };
    }
    return state.setupAnalysisCache.result;
  }

  function setupSampleGrade(count) {
    return count >= 5 ? "樣本相對充足" : count >= 3 ? "中等樣本" : count ? "小樣本暫估" : "無歷史資料";
  }

  function applySetupTieredEstimate(group, candidates) {
    const product = group.samples.filter((sample) => sample.adopted);
    const machine = candidates.filter((sample) => sample.adopted && sample.machineId === group.machineId && sample.previousProductKey !== sample.nextProductKey);
    const selected = product.length ? product : group.machineReferenceSuppressed ? [] : machine;
    const values = selected.map((sample) => sample.effectiveMs);
    // Do not rerun IQR or change candidate adoption when choosing a display reference.
    group.machineSampleCount = machine.length;
    group.machineMedianMs = setupQuantile(machine.map((sample) => sample.effectiveMs), 0.5);
    group.productConfidence = product.length ? setupSampleGrade(product.length) : "無資料";
    group.referenceSamples = selected;
    group.referenceSampleCount = selected.length;
    group.setupSource = product.length ? "product_transition" : selected.length ? "machine_default" : "no_history";
    group.medianMs = setupQuantile(values, 0.5);
    group.averageMs = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    group.minMs = values.length ? Math.min(...values) : null;
    group.maxMs = values.length ? Math.max(...values) : null;
    group.estimationLevel = product.length ? setupSampleGrade(product.length) : selected.length ? "機台參考值" : group.machineReferenceSuppressed ? "可能不需換模／待確認" : "無歷史資料";
    group.confidence = setupSampleGrade(selected.length);
    group.shortOnlyCandidates = group.samples.length > 0 && group.samples.every((sample) => sample.effectiveMs > 0 && sample.effectiveMs < 2 * 60000);
    group.usableForScheduling = false;
    group.movedEvidenceCount = selected.filter((sample) => sample.previousProductMovedToNextStation).length;
  }

  function isSetupShortReviewCandidate(sample) {
    return !sample.adopted && sample.exclusionReasons.length === 1 && sample.exclusionReasons[0] === SETUP_SHORT_REASON;
  }

  function canUseSetupManualEstimate(group) {
    return !group.machineReferenceSuppressed && group.productSampleCount === 0 && group.machineSampleCount === 0;
  }

  function setupEstimateDisplay(group) {
    // Manual references are presentation-only; never replace medians or adopted samples.
    const manual = state.setupManualEstimates.get(group.key);
    const historical = group.medianMs != null;
    const useManual = !historical && canUseSetupManualEstimate(group) && !!manual;
    const source = historical ? group.setupSource : useManual ? "manual_estimate" : "no_history";
    return {
      source,
      minutes: historical ? setupMinutes(group.medianMs) : useManual ? manual.minutes : group.machineReferenceSuppressed ? "待確認（可能不需換模）" : "需人工暫估",
      sourceLabel: source === "product_transition" ? "產品歷史" : source === "machine_default" ? "機台參考" : useManual ? "人工暫估" : group.machineReferenceSuppressed ? "待確認" : "需人工暫估",
      status: source === "product_transition" ? group.productSampleCount === 1 ? "小樣本暫估" : "多筆中位數" : "待確認",
    };
  }

  function setupCompactSummaryRow(group) {
    const estimate = setupEstimateDisplay(group);
    return { 機台: group.machineId, "前產品 → 後產品": `${group.previousProduct || "未提供"} → ${group.nextProduct || "未提供"}`,
      "預估換模分鐘數": estimate.minutes, 有效樣本數: group.productSampleCount, 估算來源說明: estimate.sourceLabel, 資料狀態: estimate.status };
  }

  function openSetupManualEditor(key) {
    const group = getHistoricalSetupAnalysis().summaries.find((item) => item.key === key);
    if (!group || !canUseSetupManualEstimate(group)) return;
    state.setupManualGroupKey = key;
    fillSetupManualEditor(group);
    const editor = document.getElementById("setupManualEditor");
    editor.open = true;
    editor.scrollIntoView({ behavior: "smooth", block: "start" });
    document.getElementById("setupManualMinutes").focus({ preventScroll: true });
  }

  function fillSetupManualEditor(group) {
    const manual = group && state.setupManualEstimates.get(group.key);
    document.getElementById("setupManualContext").textContent = group
      ? `${group.machineId}｜${group.previousProduct} → ${group.nextProduct}${canUseSetupManualEstimate(group) ? "｜目前無歷史參考，可登錄人工暫估。" : "｜目前已有歷史參考或屬可能不需換模，人工值不套用。"}`
      : "請從無歷史參考的產品組合點選「輸入人工暫估」。";
    document.getElementById("setupManualMinutes").value = manual ? manual.minutes : "";
    document.getElementById("setupManualNote").value = manual ? manual.note : "";
    document.getElementById("saveSetupManualBtn").disabled = !group || !canUseSetupManualEstimate(group);
  }

  function saveSetupManualEstimate() {
    try {
      const group = getHistoricalSetupAnalysis().summaries.find((item) => item.key === state.setupManualGroupKey);
      if (!group || !canUseSetupManualEstimate(group)) throw new Error("僅無產品及機台歷史參考，且非可能不需換模的組合可登錄人工暫估。");
      const input = document.getElementById("setupManualMinutes");
      const value = input.value.trim();
      if (input.validity.badInput) throw new Error("請輸入有效分鐘數。");
      const estimates = new Map(state.setupManualEstimates);
      if (value === "") estimates.delete(group.key);
      else {
        const minutes = Number(value);
        if (!Number.isFinite(minutes) || minutes <= 0 || minutes > Number.MAX_SAFE_INTEGER / 60000) throw new Error("人工暫估須為大於 0 的有效分鐘數。");
        estimates.set(group.key, { key: group.key, minutes, note: document.getElementById("setupManualNote").value.trim(), updatedAt: new Date().toISOString() });
      }
      commitSetupReviews(state.setupReviews, value ? "已登錄人工暫估，不改變歷史樣本或中位數。" : "已清除本組人工暫估。", estimates);
      document.getElementById("setupManualMessage").textContent = document.getElementById("setupReviewsMessage").textContent;
    } catch (error) { document.getElementById("setupManualMessage").textContent = `未保存：${error.message}`; }
  }

  function setupReviewContext(sample) {
    return { machineId: sample.machineId, previousOrder: sample.previousOrder, nextOrder: sample.nextOrder,
      previousProductKey: sample.previousProductKey, nextProductKey: sample.nextProductKey,
      previousRequiredPart: sample.previousRequiredPart, nextRequiredPart: sample.nextRequiredPart,
      previousOperator: sample.previousOperator, nextOperator: sample.nextOperator,
      pauseAt: +sample.pauseAt, startAt: +sample.startAt, startAction: sample.startAction };
  }

  function setupReviewKey(context) {
    return JSON.stringify([context.machineId, context.previousOrder, context.nextOrder, context.previousProductKey, context.nextProductKey,
      context.previousRequiredPart, context.nextRequiredPart, context.previousOperator, context.nextOperator, context.pauseAt, context.startAt, context.startAction]);
  }

  function getSetupReview(sample) {
    return state.setupReviews.get(setupReviewKey(setupReviewContext(sample))) || { status: "pending", attribution: "unknown", note: "", updatedAt: "", unreportedStatus: "unknown", unreportedNote: "", unreportedUpdatedAt: "" };
  }

  function setupReviewFields(sample) {
    const review = getSetupReview(sample);
    return { 現場覆核狀態: SETUP_REVIEW_STATUSES[review.status], 換模時間歸屬: SETUP_ATTRIBUTIONS[review.attribution],
      現場佐證備註: review.note, 覆核更新時間: review.updatedAt || "尚未覆核",
      未報工確認狀態: SETUP_UNREPORTED_STATUSES[review.unreportedStatus], 未報工確認備註: review.unreportedNote,
      未報工確認更新時間: review.unreportedUpdatedAt || "尚未確認",
      未報工人工警示: review.unreportedStatus === "confirmed_other_order" ? "不宜將整段空檔直接當換模時間；不改採用、不設0、不扣除推測工時" : review.unreportedStatus === "confirmed_no_other_order" ? "現場登錄沒有其他未報工製令單，不代表換模時間已量測" : "不可由空檔或 A／B／C 推定有無未報工工單，仍待現場佐證",
      換模加計提醒: review.attribution === "inside_processing" ? "已包含加工工時，不得重複加計" : review.attribution === "outside_processing" ? "現場登錄為加工之外；僅保存佐證，不自動加入排程或中位數" : "尚未確認，不得自動外加換模時間",
      人工覆核用途: "只記錄現場狀態，不改變正式採用／排除" };
  }

  function setupReviewEnvelope(entries = [...state.setupReviews.values()], manualEstimates = [...state.setupManualEstimates.values()]) {
    return { kind: "mes-setup-reviews", version: 3, savedAt: new Date().toISOString(), entries, manualEstimates };
  }

  function parseSetupReviewBackup(text) {
    const fail = () => { throw new Error("人工覆核備份格式或狀態無效，原資料未變更。"); };
    if (typeof text !== "string" || text.length > 5 * 1024 * 1024) fail();
    const data = JSON.parse(text);
    if (!data || data.kind !== "mes-setup-reviews" || ![1, 2, 3].includes(data.version) || !Array.isArray(data.entries) || data.entries.length > 20000) fail();
    parseSetupManualEstimates(data);
    const result = new Map();
    for (const entry of data.entries) {
      if (!entry || !entry.context || typeof entry.context !== "object" || Array.isArray(entry.context)) fail();
      const context = {};
      for (const key of ["machineId", "previousOrder", "nextOrder", "previousProductKey", "nextProductKey", "previousRequiredPart", "nextRequiredPart", "previousOperator", "nextOperator", "startAction"]) {
        if (typeof entry.context[key] !== "string" || entry.context[key].length > 4000) fail();
        context[key] = entry.context[key];
      }
      for (const key of ["pauseAt", "startAt"]) {
        if (!Number.isFinite(entry.context[key]) || !Number.isFinite(+new Date(entry.context[key]))) fail();
        context[key] = entry.context[key];
      }
      if (!context.machineId || !context.previousOrder || !context.nextOrder || !["Start", "Resume"].includes(context.startAction)) fail();
      if (!Object.hasOwn(SETUP_REVIEW_STATUSES, entry.status) || !Object.hasOwn(SETUP_ATTRIBUTIONS, entry.attribution)) fail();
      if (typeof entry.note !== "string" || entry.note.length > 2000 || typeof entry.updatedAt !== "string" || !Number.isFinite(Date.parse(entry.updatedAt))) fail();
      const unreportedStatus = data.version < 3 ? "unknown" : entry.unreportedStatus;
      const unreportedNote = data.version < 3 ? "" : entry.unreportedNote;
      const unreportedUpdatedAt = data.version < 3 ? "" : entry.unreportedUpdatedAt;
      if (!Object.hasOwn(SETUP_UNREPORTED_STATUSES, unreportedStatus) || typeof unreportedNote !== "string" || unreportedNote.length > 2000) fail();
      if (typeof unreportedUpdatedAt !== "string" || (unreportedUpdatedAt !== "" && !Number.isFinite(Date.parse(unreportedUpdatedAt)))) fail();
      const key = setupReviewKey(context);
      if (result.has(key)) fail();
      result.set(key, { context, status: entry.status, attribution: entry.attribution, note: entry.note, updatedAt: entry.updatedAt, unreportedStatus, unreportedNote, unreportedUpdatedAt });
    }
    return result;
  }

  function parseSetupManualEstimates(data) {
    const result = new Map();
    if (data.version === 1) return result;
    const fail = () => { throw new Error("人工暫估備份格式無效，原資料未變更。"); };
    if (!Array.isArray(data.manualEstimates) || data.manualEstimates.length > 20000) fail();
    for (const entry of data.manualEstimates) {
      if (!entry || typeof entry.key !== "string" || entry.key.length > 16000) fail();
      const identity = JSON.parse(entry.key);
      if (!Array.isArray(identity) || identity.length !== 3 || identity.some((value) => typeof value !== "string" || !value || value.length > 4000) || JSON.stringify(identity) !== entry.key) fail();
      if (!Number.isFinite(entry.minutes) || entry.minutes <= 0 || entry.minutes > Number.MAX_SAFE_INTEGER / 60000) fail();
      if (typeof entry.note !== "string" || entry.note.length > 2000 || typeof entry.updatedAt !== "string" || !Number.isFinite(Date.parse(entry.updatedAt)) || result.has(entry.key)) fail();
      result.set(entry.key, { key: entry.key, minutes: entry.minutes, note: entry.note, updatedAt: entry.updatedAt });
    }
    return result;
  }

  function restoreSetupReviews() {
    try {
      const saved = window.localStorage.getItem(SETUP_REVIEW_STORAGE_KEY);
      if (saved) {
        state.setupReviews = parseSetupReviewBackup(saved);
        state.setupManualEstimates = parseSetupManualEstimates(JSON.parse(saved));
        document.getElementById("setupReviewsMessage").textContent = `已還原 ${state.setupReviews.size} 筆人工覆核、${state.setupManualEstimates.size} 組人工暫估；正式採用判定不變。`;
      }
    } catch (error) {
      document.getElementById("setupReviewsMessage").textContent = "人工覆核無法還原（儲存受限或舊資料損壞），未覆寫原資料。請匯入 JSON 備份；目前未還原的紀錄顯示待確認。";
    }
  }

  function commitSetupReviews(reviews, notice, manualEstimates = state.setupManualEstimates) {
    const encoded = JSON.stringify(setupReviewEnvelope([...reviews.values()], [...manualEstimates.values()]));
    const normalized = parseSetupReviewBackup(encoded);
    const normalizedEstimates = parseSetupManualEstimates(JSON.parse(encoded));
    let saved = false;
    try {
      const previous = window.localStorage.getItem(SETUP_REVIEW_STORAGE_KEY);
      if (previous) {
        parseSetupReviewBackup(previous);
        window.localStorage.setItem(SETUP_REVIEW_BACKUP_KEY, previous);
      }
      window.localStorage.setItem(SETUP_REVIEW_STORAGE_KEY, encoded);
      saved = true;
    } catch (error) { /* Keep the in-memory edit exportable without overwriting unreadable storage. */ }
    state.setupReviews = normalized;
    state.setupManualEstimates = normalizedEstimates;
    document.getElementById("setupReviewsMessage").textContent = `${notice} ${saved ? "已保存於此瀏覽器，請另匯出 JSON 備份。" : "瀏覽器保存失敗，僅本次畫面保留；請立即匯出 JSON 備份，重新整理可能遺失。"}`;
    renderHistoricalSetupSection();
  }

  function exportSetupReviews() {
    try {
      const blob = new Blob([JSON.stringify(setupReviewEnvelope(), null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "MES換模人工覆核備份.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      document.getElementById("setupReviewsMessage").textContent = `已下載 ${state.setupReviews.size} 筆人工覆核、${state.setupManualEstimates.size} 組人工暫估備份；未按保存的表單不在備份內。此下載不表示瀏覽器保存成功。`;
    } catch (error) { document.getElementById("setupReviewsMessage").textContent = `備份下載失敗：${error.message}`; }
  }

  async function importSetupReviews(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("備份超過 5 MB。");
      const text = await file.text();
      const imported = parseSetupReviewBackup(text);
      const data = JSON.parse(text);
      const estimates = parseSetupManualEstimates(data);
      // Legacy backups have no unreported-order fields; merging must not erase newer confirmations.
      if (data.version < 3) imported.forEach((entry, key) => {
        const existing = state.setupReviews.get(key);
        if (existing) Object.assign(entry, { unreportedStatus: existing.unreportedStatus, unreportedNote: existing.unreportedNote, unreportedUpdatedAt: existing.unreportedUpdatedAt });
      });
      const overlap = [...imported.keys()].filter((key) => state.setupReviews.has(key)).length;
      const estimateOverlap = [...estimates.keys()].filter((key) => state.setupManualEstimates.has(key)).length;
      if (!window.confirm(`匯入 ${imported.size} 筆人工覆核、${estimates.size} 組人工暫估，取代 ${overlap} 筆相同事件覆核與 ${estimateOverlap} 組相同產品暫估，保留其他紀錄。${data.version < 3 ? "舊版未含未報工確認，保留目前已登錄確認。" : "包含未報工確認狀態與備註。"}正式採用判定不變。是否繼續？`)) return;
      commitSetupReviews(new Map([...state.setupReviews, ...imported]), "已合併匯入人工覆核與暫估。", new Map([...state.setupManualEstimates, ...estimates]));
    } catch (error) { document.getElementById("setupReviewsMessage").textContent = `匯入失敗，原人工資料未變更：${error.message}`; }
    finally { event.target.value = ""; }
  }

  function restoreSetupReviewsBackup() {
    try {
      const saved = window.localStorage.getItem(SETUP_REVIEW_BACKUP_KEY);
      if (!saved) throw new Error("目前沒有上一版備份。");
      const reviews = parseSetupReviewBackup(saved);
      const estimates = parseSetupManualEstimates(JSON.parse(saved));
      if (!window.confirm("還原上一版人工覆核、未報工確認與暫估？舊版未含的確認欄位將回復尚未確認。目前版本將保留為上一版備份，不改變正式採用判定。")) return;
      commitSetupReviews(reviews, "已還原上一版人工設定。", estimates);
    } catch (error) { document.getElementById("setupReviewsMessage").textContent = `未還原：${error.message}`; }
  }

  function openSetupReviewEditor(id) {
    const sample = getHistoricalSetupAnalysis().candidates.find((item) => item.id === id);
    if (!sample) return;
    state.setupReviewSampleKey = setupReviewKey(setupReviewContext(sample));
    fillSetupReviewEditor(sample);
    const editor = document.getElementById("setupReviewEditor");
    editor.open = true;
    editor.scrollIntoView({ behavior: "smooth", block: "start" });
    document.getElementById("setupReviewStatus").focus({ preventScroll: true });
  }

  function fillSetupReviewEditor(sample) {
    const review = sample ? getSetupReview(sample) : { status: "pending", attribution: "unknown", note: "", unreportedStatus: "unknown", unreportedNote: "" };
    document.getElementById("setupReviewContext").textContent = sample
      ? `${sample.machineId}｜${sample.previousOrder} ${sample.previousProduct} → ${sample.nextOrder} ${sample.nextProduct}｜${formatDateTime(sample.pauseAt)} Pause → ${formatDateTime(sample.startAt)} ${sample.startAction}｜正式${sample.adopted ? "採用" : "排除"}（不受覆核影響）`
      : "請從短時間清單或任一產品候選明細點選「覆核」。";
    document.getElementById("setupReviewStatus").value = review.status;
    document.getElementById("setupReviewAttribution").value = review.attribution;
    document.getElementById("setupReviewNote").value = review.note;
    document.getElementById("setupUnreportedStatus").value = review.unreportedStatus;
    document.getElementById("setupUnreportedNote").value = review.unreportedNote;
    document.getElementById("saveSetupReviewBtn").disabled = !sample;
    renderSetupUnreportedImpact(sample);
  }

  function saveSetupReview() {
    const sample = getHistoricalSetupAnalysis().candidates.find((item) => setupReviewKey(setupReviewContext(item)) === state.setupReviewSampleKey);
    if (!sample) return;
    try {
      const reviews = new Map(state.setupReviews);
      const previous = getSetupReview(sample);
      const unreportedStatus = document.getElementById("setupUnreportedStatus").value;
      const unreportedNote = document.getElementById("setupUnreportedNote").value.trim();
      const unreportedUpdatedAt = previous.unreportedStatus !== unreportedStatus || previous.unreportedNote !== unreportedNote ? new Date().toISOString() : previous.unreportedUpdatedAt;
      reviews.set(state.setupReviewSampleKey, { context: setupReviewContext(sample), status: document.getElementById("setupReviewStatus").value,
        attribution: document.getElementById("setupReviewAttribution").value, note: document.getElementById("setupReviewNote").value.trim(), updatedAt: new Date().toISOString(), unreportedStatus, unreportedNote, unreportedUpdatedAt });
      commitSetupReviews(reviews, "本筆人工覆核已套用，未改變正式採用／排除或中位數。");
    } catch (error) { document.getElementById("setupReviewsMessage").textContent = `未保存：${error.message}`; }
  }

  function setupShortReviewRow(sample) {
    return { 樣本ID: sample.id, 機台: sample.machineId, 前製令單: sample.previousOrder, 後製令單: sample.nextOrder,
      前產品: sample.previousProduct, 後產品: sample.nextProduct, 前操作員: sample.previousOperator, 後操作員: sample.nextOperator,
      最後Pause: formatDateTime(sample.pauseAt), "第一筆Start/Resume": formatDateTime(sample.startAt),
      原始分鐘: setupMinutes(sample.rawMs), 調整後候選分鐘數: setupMinutes(sample.effectiveMs), 排除原因: sample.exclusionReasons.join("；"),
      "A／B／C類別": sample.operatorScenario, 日曆確認狀態: sample.calendarGap.confirmationStatus,
      正式計算狀態: "排除（不因人工覆核自動採用）", 風險提醒: "可能內含換模／待現場確認", ...setupReviewFields(sample) };
  }

  function renderSetupReviewSection(analysis) {
    const samples = analysis.candidates.filter(isSetupShortReviewCandidate);
    const pages = Math.max(1, Math.ceil(samples.length / 25));
    state.setupReviewPage = Math.min(pages, Math.max(1, state.setupReviewPage));
    document.getElementById("setupReviewPagination").hidden = pages === 1;
    document.getElementById("setupReviewPrevBtn").disabled = state.setupReviewPage === 1;
    document.getElementById("setupReviewNextBtn").disabled = state.setupReviewPage === pages;
    document.getElementById("setupReviewPageLabel").textContent = `第 ${state.setupReviewPage} / ${pages} 頁，共 ${samples.length} 筆`;
    const shown = samples.slice((state.setupReviewPage - 1) * 25, state.setupReviewPage * 25);
    const headers = samples.length ? Object.keys(setupShortReviewRow(samples[0])) : [];
    const pending = samples.filter((sample) => getSetupReview(sample).status === "pending").length;
    document.getElementById("setupShortReviewTable").innerHTML = `<p>僅因短時間排除 ${samples.length} 筆；人工待確認 ${pending} 筆；其餘已登錄 ${samples.length - pending} 筆。全數仍維持正式排除。</p>` + (shown.length
      ? `<div class="table-shell setup-sample-table" tabindex="0"><table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}<th>人工覆核</th></tr></thead><tbody>${shown.map((sample) => `<tr>${Object.values(setupShortReviewRow(sample)).map((value) => `<td>${escapeHtml(value)}</td>`).join("")}<td><button type="button" class="link-button" data-setup-review-id="${escapeHtml(sample.id)}">覆核</button></td></tr>`).join("")}</tbody></table></div>`
      : `<div class="empty-card">目前沒有僅因短時間門檻排除的候選。</div>`);
    fillSetupReviewEditor(analysis.candidates.find((sample) => setupReviewKey(setupReviewContext(sample)) === state.setupReviewSampleKey));
  }

  function buildSetupUnreportedRisk(analysis) {
    const machines = new Map(), samples = new Map(), references = new Map();
    // Independent risk annotation: only read final adopted samples, never mutate qualification.
    analysis.candidates.forEach((sample) => {
      if (!machines.has(sample.machineId)) machines.set(sample.machineId, { values: [] });
      if (sample.adopted && sample.previousProductKey !== sample.nextProductKey) machines.get(sample.machineId).values.push(sample.effectiveMs);
    });
    machines.forEach((machine) => {
      machine.count = machine.values.length;
      machine.q1 = setupQuantile(machine.values, 0.25);
      machine.q3 = setupQuantile(machine.values, 0.75);
      machine.thresholdMs = machine.count >= 5 ? machine.q3 + 1.5 * (machine.q3 - machine.q1) : null;
    });
    analysis.candidates.forEach((sample) => {
      const machine = machines.get(sample.machineId);
      let status, reason;
      if (machine.count < 5) { status = "insufficient_history"; reason = "樣本不足，無法自動判定"; }
      else if (sample.crossDay) { status = "cross_day"; reason = "跨日候選，保留日曆／等待提醒，不作同日長空檔判定"; }
      else if (!Number.isFinite(sample.effectiveMs) || sample.effectiveMs <= 0) { status = "invalid_duration"; reason = "有效候選時間非正值或無效，不作長空檔判定"; }
      else if (sample.effectiveMs > machine.thresholdMs) { status = "long_gap"; reason = "可能存在未報工製令單／待確認（同日有效空檔超過同機台 Q3＋1.5×IQR）"; }
      else { status = "not_triggered"; reason = "未觸發長空檔提醒，不代表沒有未報工製令單"; }
      samples.set(sample.id, { status, reason, count: machine.count, q1: machine.q1, q3: machine.q3, thresholdMs: machine.thresholdMs });
    });
    analysis.summaries.forEach((group) => group.referenceSamples.forEach((sample) => {
      if (!references.has(sample.id)) references.set(sample.id, []);
      references.get(sample.id).push(group);
    }));
    return { machines, samples, references };
  }

  function getSetupUnreportedRisk() {
    const analysis = getHistoricalSetupAnalysis();
    if (!state.setupUnreportedCache || state.setupUnreportedCache.analysis !== analysis) {
      state.setupUnreportedCache = { analysis, value: buildSetupUnreportedRisk(analysis) };
    }
    return state.setupUnreportedCache.value;
  }

  function setupUnreportedFields(sample) {
    const risk = getSetupUnreportedRisk();
    const item = risk.samples.get(sample.id);
    return {
      未報工風險代碼: item ? item.status : "unavailable",
      未報工風險原因: item ? item.reason : "候選不在目前分析範圍，無法判定",
      長空檔歷史樣本數: item ? item.count : 0,
      "長空檔Q1(分鐘)": item && item.count >= 5 ? setupMinutes(item.q1) : "樣本不足",
      "長空檔Q3(分鐘)": item && item.count >= 5 ? setupMinutes(item.q3) : "樣本不足",
      "長空檔提醒門檻(分鐘)": item && item.thresholdMs != null ? setupMinutes(item.thresholdMs) : "樣本不足，無法自動判定",
      長空檔判定依據: "同機台最終採用且不同產品，至少5筆；Q3＋1.5×IQR；同日正分鐘以未四捨五入值比較，僅供提醒",
      目前引用估算組合數: (risk.references.get(sample.id) || []).length,
      未報工風險用途: "風險及確認與採用分開；A類也可能有未報工工單，不改時間或代表值",
    };
  }

  function setupUnreportedRow(sample) {
    return { 樣本ID: sample.id, 機台: sample.machineId, 設備名稱: sample.machineName,
      前操作員: sample.previousOperator || "未提供", 後操作員: sample.nextOperator || "未提供",
      前製令單: sample.previousOrder, 後製令單: sample.nextOrder, 前產品: sample.previousProduct, 後產品: sample.nextProduct,
      原始候選開始時間: formatDateTime(sample.pauseAt), 原始候選結束時間: formatDateTime(sample.startAt), 終點動作: sample.startAction,
      原始候選分鐘數: setupMinutes(sample.rawMs), 調整後候選分鐘數: setupMinutes(sample.effectiveMs),
      "A／B／C類別": sample.operatorScenario, 日曆確認狀態: sample.calendarGap.confirmationStatus, 跨日: sample.crossDay ? "是" : "否",
      "正式採用／排除": sample.adopted ? "採用" : "排除", 正式排除原因: sample.exclusionReasons.join("；"),
      ...setupUnreportedFields(sample), ...setupReviewFields(sample) };
  }

  function setupUnreportedImpactRow(sample, group) {
    const estimate = setupEstimateDisplay(group);
    return { 已確認有未報工樣本ID: sample.id, 機台: sample.machineId, 前製令單: sample.previousOrder, 後製令單: sample.nextOrder,
      "樣本正式採用／排除": sample.adopted ? "採用" : "排除", 樣本調整後分鐘數: setupMinutes(sample.effectiveMs),
      引用產品組合鍵值: group.key, 引用組合前產品: group.previousProduct, 引用組合後產品: group.nextProduct,
      估算來源: estimate.source, 估算來源說明: estimate.sourceLabel, 預估換模分鐘數: estimate.minutes, 本組有效樣本數: group.productSampleCount,
      提醒: "不宜將整段空檔直接當換模時間；僅列引用範圍，未移除樣本、未自動重算代表值" };
  }

  function renderSetupUnreportedImpact(sample) {
    const container = document.getElementById("setupUnreportedImpact");
    if (!sample) { container.innerHTML = ""; return; }
    const risk = getSetupUnreportedRisk();
    const item = risk.samples.get(sample.id);
    container.innerHTML = `<p>${escapeHtml(item.reason)}。${item.thresholdMs == null ? "不套用統計門檻。" : `機台歷史 ${item.count} 筆，提醒門檻 ${setupMinutes(item.thresholdMs)} 分鐘。`}統計提醒不等於現場確認。</p>`;
    if (getSetupReview(sample).unreportedStatus !== "confirmed_other_order") return;
    const groups = risk.references.get(sample.id) || [];
    container.innerHTML += `<p class="setup-unreported-warning">已登錄中間有其他未報工製令單：不宜將整段空檔直接當換模時間。原始／調整後時間、採用／排除與正式代表值均未變更。</p><p>${sample.adopted ? `此筆仍採用，目前被 ${groups.length} 組估算引用。` : "此筆原已排除，未參與目前代表值。"}以下僅為引用範圍，不表示所有數值一定會改變。</p>`;
    if (groups.length) {
      const headers = Object.keys(setupUnreportedImpactRow(sample, groups[0]));
      container.innerHTML += `<details><summary>查看 ${groups.length} 組受影響估算</summary><div class="table-shell setup-sample-table" tabindex="0"><table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${groups.map((group) => `<tr>${Object.values(setupUnreportedImpactRow(sample, group)).map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></details>`;
    }
  }

  function renderSetupUnreportedSection() {
    const analysis = getHistoricalSetupAnalysis(), risk = getSetupUnreportedRisk();
    const longCount = analysis.candidates.filter((sample) => risk.samples.get(sample.id).status === "long_gap").length;
    const insufficient = analysis.candidates.filter((sample) => risk.samples.get(sample.id).status === "insufficient_history").length;
    const confirmed = analysis.candidates.filter((sample) => getSetupReview(sample).unreportedStatus === "confirmed_other_order");
    const samples = analysis.candidates.filter((sample) => {
      const item = risk.samples.get(sample.id), review = getSetupReview(sample);
      if (state.setupUnreportedFilter === "all") return true;
      if (state.setupUnreportedFilter === "insufficient") return item.status === "insufficient_history";
      return item.status === "long_gap" || review.unreportedStatus !== "unknown" || !!review.unreportedNote;
    });
    const pages = Math.max(1, Math.ceil(samples.length / 25));
    state.setupUnreportedPage = Math.max(1, Math.min(pages, state.setupUnreportedPage));
    document.getElementById("setupUnreportedCount").textContent = `長空檔提醒 ${longCount} 筆；樣本不足 ${insufficient} 筆；已登錄有其他未報工工單 ${confirmed.length} 筆（其中原採用 ${confirmed.filter((sample) => sample.adopted).length} 筆，未改變判定）。目前顯示 ${samples.length} 筆。`;
    document.getElementById("setupUnreportedPagination").hidden = pages === 1;
    document.getElementById("setupUnreportedPrevBtn").disabled = state.setupUnreportedPage === 1;
    document.getElementById("setupUnreportedNextBtn").disabled = state.setupUnreportedPage === pages;
    document.getElementById("setupUnreportedPageLabel").textContent = `第 ${state.setupUnreportedPage} / ${pages} 頁`;
    const shown = samples.slice((state.setupUnreportedPage - 1) * 25, state.setupUnreportedPage * 25);
    const headers = samples.length ? Object.keys(setupUnreportedRow(samples[0])) : [];
    document.getElementById("setupUnreportedTable").innerHTML = shown.length
      ? `<div class="table-shell setup-sample-table" tabindex="0"><table><thead><tr><th>操作</th>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${shown.map((sample) => `<tr><td><button type="button" class="link-button" data-setup-review-id="${escapeHtml(sample.id)}">覆核</button></td>${Object.values(setupUnreportedRow(sample)).map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
      : `<div class="empty-card">目前範圍沒有候選；可選擇全部候選或樣本不足資料，沒有提醒不代表沒有未報工工單。</div>`;
  }

  function normalizeSetupCalendarSettings(value) {
    const fail = () => { throw new Error("行事曆備份格式或日期／時段無效，原設定未變更。"); };
    const object = (item) => item && typeof item === "object" && !Array.isArray(item);
    const list = (items) => { if (!Array.isArray(items) || items.length > 20000) fail(); return items; };
    const date = (item) => {
      if (typeof item !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(item) || formatDateInput(parseDateOnly(item)) !== item) fail();
      return item;
    };
    const name = (item) => { if (typeof item !== "string" || !item.trim() || item.length > 1000) fail(); return item.trim(); };
    const intervals = (items) => mergeSetupIntervals(list(items).map((pair) => {
      if (!Array.isArray(pair) || pair.length !== 2 || pair.some((n) => !Number.isInteger(n)) || pair[0] < 0 || pair[1] > 1440 || pair[0] >= pair[1]) fail();
      return [...pair];
    }));
    const entries = (items, field, withIntervals = true) => {
      const seen = new Set();
      return list(items).map((item) => {
        if (!object(item)) fail();
        const result = { date: date(item.date), [field]: name(item[field]) };
        const key = JSON.stringify([result.date, result[field]]);
        if (seen.has(key)) fail();
        seen.add(key);
        if (withIntervals) result.intervals = intervals(item.intervals);
        return result;
      });
    };
    if (!object(value) || typeof value.confirmed !== "boolean" || !object(value.officialYears)) fail();
    const officialYears = {};
    Object.entries(value.officialYears).forEach(([year, data]) => {
      if (!/^\d{4}$/.test(year) || !object(data) || data.complete !== true || data.rowCount !== new Date(Number(year), 2, 0).getDate() + 337) fail();
      const holidays = [...new Set(list(data.holidays).map(date))];
      if (holidays.some((day) => !day.startsWith(`${year}-`)) || typeof data.source !== "string" || data.source.length > 2000) fail();
      officialYears[year] = { complete: true, rowCount: data.rowCount, source: data.source, holidays };
    });
    return { holidays: [...new Set(list(value.holidays).map(date))], machineDaysOff: entries(value.machineDaysOff, "machineId", false),
      confirmed: value.confirmed, workIntervals: intervals(value.workIntervals), breakIntervals: intervals(value.breakIntervals),
      attendance: entries(value.attendance, "operator"), operatorOverrides: entries(value.operatorOverrides, "operator"),
      machineOverrides: entries(value.machineOverrides, "machineId"), officialYears };
  }

  function setupCalendarEnvelope(calendar) {
    return { kind: "mes-setup-calendar", version: 1, savedAt: new Date().toISOString(), calendar: normalizeSetupCalendarSettings(calendar) };
  }

  function parseSetupCalendarBackup(text) {
    const data = JSON.parse(text.replace(/^\uFEFF/, ""));
    if (!data || data.kind !== "mes-setup-calendar" || data.version !== 1) throw new Error("不是支援的 MES 換模行事曆備份版本，原設定未變更。");
    return normalizeSetupCalendarSettings(data.calendar);
  }

  function fillSetupCalendarInputs() {
    const calendar = state.setupCalendar;
    const time = (n) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
    const ranges = (items) => items.length ? items.map(([a, b]) => `${time(a)}-${time(b)}`).join(";") : "休";
    const entries = (items, field) => items.map((item) => `${item.date},${item[field]},${ranges(item.intervals)}`).join("\n");
    document.getElementById("setupWorkIntervals").value = ranges(calendar.workIntervals);
    document.getElementById("setupBreakIntervals").value = calendar.breakIntervals.length ? ranges(calendar.breakIntervals) : "";
    document.getElementById("setupHolidayInput").value = calendar.holidays.join("\n");
    document.getElementById("setupMachineDaysOffInput").value = calendar.machineDaysOff.map((item) => `${item.machineId},${item.date}`).join("\n");
    document.getElementById("setupAttendanceInput").value = entries(calendar.attendance, "operator");
    document.getElementById("setupOperatorOverrides").value = entries(calendar.operatorOverrides, "operator");
    document.getElementById("setupMachineOverrides").value = entries(calendar.machineOverrides, "machineId");
    document.getElementById("setupCalendarConfirmed").checked = calendar.confirmed;
  }

  function restoreSetupCalendar() {
    const message = document.getElementById("setupCalendarMessage");
    try {
      const saved = window.localStorage.getItem(SETUP_CALENDAR_STORAGE_KEY);
      if (saved) {
        state.setupCalendar = parseSetupCalendarBackup(saved);
        fillSetupCalendarInputs();
        message.textContent = "已還原此瀏覽器保存的換模行事曆；請定期匯出 JSON 備份。";
      }
    } catch (error) {
      message.textContent = `行事曆設定無法還原，暫用預設班別；未覆寫原保存資料。${error.message} 請匯入有效備份或檢查瀏覽器儲存設定。`;
    }
  }

  function commitSetupCalendar(calendar, notice) {
    const normalized = normalizeSetupCalendarSettings(calendar);
    let saved = false;
    try {
      const previous = window.localStorage.getItem(SETUP_CALENDAR_STORAGE_KEY);
      // Preserve the last good saved configuration before replacing it.
      if (previous && JSON.stringify(parseSetupCalendarBackup(previous)) !== JSON.stringify(normalized)) {
        window.localStorage.setItem(SETUP_CALENDAR_BACKUP_KEY, previous);
      }
      window.localStorage.setItem(SETUP_CALENDAR_STORAGE_KEY, JSON.stringify(setupCalendarEnvelope(normalized)));
      saved = true;
    } catch (error) { saved = false; }
    state.setupCalendar = normalized;
    state.setupPage = 1;
    fillSetupCalendarInputs();
    renderHistoricalSetupSection();
    document.getElementById("setupCalendarMessage").textContent = `${notice} ${saved ? "已保存至此瀏覽器；重新整理可還原。建議另匯出 JSON 備份。" : "僅本次畫面套用，瀏覽器保存失敗（可能停用、空間不足或舊資料損壞）；重新整理可能遺失，請立即匯出 JSON 備份。"}`;
  }

  function exportSetupCalendarSettings() {
    try {
      const blob = new Blob([JSON.stringify(setupCalendarEnvelope(state.setupCalendar), null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = url;
      link.download = `MES換模行事曆備份-${formatDateInput(new Date())}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      document.getElementById("setupCalendarMessage").textContent = "已下載目前已套用設定的 JSON 備份，可在其他電腦／瀏覽器匯入。此下載不表示 LocalStorage 保存成功。";
    } catch (error) { document.getElementById("setupCalendarMessage").textContent = `備份下載失敗：${error.message}`; }
  }

  async function importSetupCalendarSettings(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("設定檔超過 5MB，未匯入。");
      const calendar = parseSetupCalendarBackup(await file.text());
      if (!window.confirm("匯入將取代目前已套用設定與未套用的輸入，並保留上一版瀏覽器設定。是否繼續？")) return;
      commitSetupCalendar(calendar, "已匯入換模行事曆備份，僅影響本分析。");
    } catch (error) { document.getElementById("setupCalendarMessage").textContent = `匯入失敗，原設定未變更：${error.message}`; }
    finally { event.target.value = ""; }
  }

  function restoreSetupCalendarBackup() {
    try {
      const previous = window.localStorage.getItem(SETUP_CALENDAR_BACKUP_KEY);
      if (!previous) throw new Error("此瀏覽器尚無上一版備份，可改由 JSON 檔匯入。");
      const calendar = parseSetupCalendarBackup(previous);
      if (!window.confirm("還原上一版將取代目前已套用設定與未套用的輸入。是否繼續？")) return;
      commitSetupCalendar(calendar, "已還原上一版換模行事曆。");
    } catch (error) { document.getElementById("setupCalendarMessage").textContent = `未還原：${error.message}`; }
  }

  function applySetupCalendar() {
    const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && formatDateInput(parseDateOnly(value)) === value;
    const holidays = document.getElementById("setupHolidayInput").value.split(/[\s,，]+/).filter(Boolean);
    const machineDaysOff = document.getElementById("setupMachineDaysOffInput").value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const [machineId, date, ...extra] = line.split(/[,，]/).map((value) => value.trim());
      return { machineId, date, extra };
    });
    const message = document.getElementById("setupCalendarMessage");
    if (holidays.some((date) => !validDate(date)) || machineDaysOff.some((item) => !item.machineId || !validDate(item.date) || item.extra.length)) {
      message.textContent = "日期格式錯誤，請使用有效的 YYYY-MM-DD；機台非工作日請使用 設備編號,YYYY-MM-DD。原設定未變更。";
      return;
    }
    let settings;
    try {
      settings = { workIntervals: parseSetupIntervals(document.getElementById("setupWorkIntervals").value),
        breakIntervals: parseSetupIntervals(document.getElementById("setupBreakIntervals").value, true),
        attendance: parseSetupCalendarEntries(document.getElementById("setupAttendanceInput").value, "operator"),
        operatorOverrides: parseSetupCalendarEntries(document.getElementById("setupOperatorOverrides").value, "operator"),
        machineOverrides: parseSetupCalendarEntries(document.getElementById("setupMachineOverrides").value, "machineId") };
    } catch (error) { message.textContent = `${error.message} 原設定未變更。`; return; }
    try {
      commitSetupCalendar({ ...state.setupCalendar, ...settings, holidays: [...new Set(holidays)], machineDaysOff: machineDaysOff.map(({ machineId, date }) => ({ machineId, date })), confirmed: document.getElementById("setupCalendarConfirmed").checked }, "已套用，僅更新歷史推估換模分析。");
    } catch (error) { message.textContent = `${error.message} 原設定未變更。`; }
  }

  function setupMinutes(value) {
    return value == null ? "—" : Number((value / 60000).toFixed(4));
  }

  function setupSampleExportRow(sample) {
    const gap = sample.calendarGap;
    return {
      樣本ID: sample.id, 機台: sample.machineId, 設備名稱: sample.machineName,
      前製令單: sample.previousOrder, 前產品: sample.previousProduct, 前閥類: sample.previousValve || "未提供",
      最後Pause: formatDateTime(sample.pauseAt), 原始Pause列號: sample.pauseRow,
      前產品已移往下一站: sample.previousProductMovedToNextStation ? "是" : "未觀察到",
      下一站佐證: sample.nextStationEvidence || "—", previousProductMovedToNextStation: sample.previousProductMovedToNextStation,
      後製令單: sample.nextOrder, 後產品: sample.nextProduct, 後閥類: sample.nextValve || "未提供",
      "第一筆Start/Resume": formatDateTime(sample.startAt), 開工動作: sample.startAction, 原始開工列號: sample.startRow,
      前操作員: sample.previousOperator || "未提供", 後操作員: sample.nextOperator || "未提供", 同一操作員: sample.sameOperator == null ? "不明" : sample.sameOperator ? "是" : "否",
      期間有他機報工: sample.operatorWorkedOtherMachine ? "是" : "否", 他機報工筆數: sample.otherMachineWorkCount,
      他機操作分鐘: sample.otherMachineWorkMinutes == null ? "無完整區間，不估算" : Number(sample.otherMachineWorkMinutes.toFixed(4)),
      他機設備: [...new Set([...sample.otherMachineWorkEvents, ...sample.otherMachineIntervals].map((event) => event.machineId))].join("、") || "—",
      他機原始列號: sample.otherMachineWorkEvents.map((event) => event.rowNumber).join("、") || "—",
      期間缺機台資訊筆數: sample.unknownMachineEventCount, 人員情境: sample.operatorScenario, 人員情境說明: sample.operatorEvidenceLabel,
      操作員行為可信度: sample.operatorConfidence, "A類採用樣本（僅操作員行為）": sample.highConfidence ? "是" : "否",
      原始分鐘: setupMinutes(sample.rawMs), 有效工作分鐘: setupMinutes(sample.effectiveMs), 跨日: sample.crossDay ? "是" : "否",
      "最終採用／排除": sample.adopted ? "採用" : "排除", 產品層檢查: sample.productLevelAdopted ? "通過" : "排除", 排除原因: sample.exclusionReasons.join("；"),
      機台編號: sample.machineId, 前一製令單號: sample.previousOrder, 下一製令單號: sample.nextOrder,
      前一操作員: sample.previousOperator || "未提供", 下一操作員: sample.nextOperator || "未提供",
      前需求料件: sample.previousRequiredPart, 後需求料件: sample.nextRequiredPart, 可能不需換模: sample.possiblyNoSetup ? "是" : "未確認",
      原始候選開始時間: formatDateTime(sample.pauseAt), 原始候選結束時間: formatDateTime(sample.startAt), 原始候選分鐘數: setupMinutes(sample.rawMs),
      國定假日扣除分鐘數: setupMinutes(gap.deductions.holiday), 週日扣除分鐘數: setupMinutes(gap.deductions.sunday),
      週六未出勤扣除分鐘數: setupMinutes(gap.deductions.saturday), 非工作時段扣除分鐘數: setupMinutes(gap.deductions.nonWorking),
      休息時間扣除分鐘數: setupMinutes(gap.deductions.break), 日曆未確認扣除分鐘數: setupMinutes(gap.deductions.unconfirmedCalendar),
      調整後候選分鐘數: setupMinutes(sample.effectiveMs), "A／B／C類別": sample.operatorScenario, operatorWorkedOtherMachine: sample.operatorWorkedOtherMachine,
      其他機台操作明細: sample.otherMachineWorkEvents.map((event) => `${event.operator} ${event.machineId} ${event.order} ${event.action} ${formatDateTime(event.time)}（原始列 ${event.rowNumber}）`).join("\n") || "未見期間他機事件",
      他機可配對區間及重疊: sample.otherMachineIntervals.map((item) => `${item.operator} ${item.machineId} ${item.order} ${formatDateTime(item.startAt)}→${formatDateTime(item.endAt)}；重疊 ${formatDateTime(item.overlapStart)}→${formatDateTime(item.overlapEnd)}（${setupMinutes(item.overlapMs)} 分鐘）`).join("\n") || "無完整區間；不推定操作分鐘",
      他機重疊時間說明: "原始報工區間聯集，不等於人員實際佔用時間；不從候選扣除",
      週六出勤確認狀態: gap.saturdayStatus, 政府年度日曆狀態: gap.calendarStatus,
      日曆確認狀態: gap.confirmationStatus, 日曆確認說明: gap.confirmationReasons.join("；"),
      工廠例外確認狀態: gap.factoryCalendarConfirmed ? "已人工核對" : "工廠行事曆尚未完整，請核對例外",
      日曆來源: gap.calendarSources.join("\n"),
      換模候選可信度: `${sample.operatorScenario === "unknown" ? "人員資訊不足" : `${sample.operatorScenario} 類`}｜操作員行為可信度${sample.operatorConfidence}｜日曆${gap.confirmationStatus === "預設班別推估" ? "使用預設班別推估" : gap.confirmationStatus}；${sample.adopted ? "候選推估，非實測換模" : "不納入代表值"}`,
      異常及待確認原因: sample.exclusionReasons.join("；") || (sample.operatorScenario === "B" ? "不同人接手；候選推估" : sample.operatorWorkedOtherMachine ? "期間操作其他機台；空檔不等於真實換模" : "候選推估，尚無實際換模量測"),
      核對差額分鐘: setupMinutes(sample.rawMs - sample.effectiveMs - Object.values(gap.deductions).reduce((sum, value) => sum + value, 0)),
      ...setupReviewFields(sample),
      ...setupUnreportedFields(sample),
    };
  }

  function setupSummaryExportRow(group, calendar) {
    const estimate = setupEstimateDisplay(group);
    const manual = state.setupManualEstimates.get(group.key);
    const notApplicable = "不套用（可能不需換模）";
    const referenceLabel = group.setupSource === "product_transition" ? "產品組合候選參考值（非實測換模時間）"
      : group.setupSource === "machine_default" ? "機台參考值（不是該產品組合的實測中位數）"
        : group.machineReferenceSuppressed ? "可能不需換模，不建立適用代表值；no_history 不表示機台一定沒有歷史" : "無歷史資料";
    const referenceMissing = group.machineReferenceSuppressed ? notApplicable : "無歷史資料";
    return {
      機台: group.machineId, 設備名稱: group.machineName, 前產品: group.previousProduct || "未提供", 後產品: group.nextProduct || "未提供",
      前閥類: group.previousValve || "未提供", 後閥類: group.nextValve || "未提供",
      候選樣本數: group.candidateCount, 可能不需換模候選數: group.possiblyNoSetupCount,
      產品組合有效樣本數: group.productSampleCount,
      "產品組合候選中位數(分鐘)": group.productMedianMs == null ? "無資料" : setupMinutes(group.productMedianMs),
      機台參考樣本數: group.machineSampleCount,
      "機台參考中位數(分鐘)": group.machineMedianMs == null ? "無歷史資料" : group.machineReferenceSuppressed ? notApplicable : setupMinutes(group.machineMedianMs),
      參考來源有效樣本數: group.referenceSampleCount,
      "採用參考中位數(分鐘)": group.medianMs == null ? referenceMissing : setupMinutes(group.medianMs),
      "參考來源平均值(分鐘)": group.averageMs == null ? referenceMissing : setupMinutes(group.averageMs),
      "參考來源最短(分鐘)": group.minMs == null ? referenceMissing : setupMinutes(group.minMs),
      "參考來源最長(分鐘)": group.maxMs == null ? referenceMissing : setupMinutes(group.maxMs), 參考來源樣本數等級: group.confidence,
      推估來源: group.setupSource, 參考值來源說明: referenceLabel,
      代表值適用限制: group.machineReferenceSuppressed ? "相同需求料件候選不適用代表值且不設為 0；不套用機台參考，其餘最終有效產品樣本僅適用不同料件候選"
        : group.shortOnlyCandidates ? "本組只有短候選；機台值僅供比較，不得取代短空檔或自動加計換模" : "候選推估，非正式換模標準；是否內含加工工時需現場確認",
      移站佐證樣本數: group.movedEvidenceCount,
      行事曆狀態: group.samples.every((sample) => sample.calendarGap.calendarConfirmed) ? "政府年度日曆已確認；工廠例外另行核對" : "日曆資料未確認",
      工廠例外確認狀態: calendar.confirmed ? "已人工核對" : "行事曆尚未完整",
      候選日曆確認狀態: setupCalendarStatusSummary(group.samples), 參考值樣本日曆確認狀態: setupCalendarStatusSummary(group.referenceSamples),
      資料用途: "候選推估／歷史參考，不可直接寫入 APS 標準換模時間",
      產品候選用途: group.productConfidence,
      "代表值中A類採用樣本數（僅操作員行為）": group.highConfidenceCount, "A類採用樣本中位數(分鐘)": setupMinutes(group.highConfidenceMedianMs), 人員情境分布: group.operatorEvidenceSummary,
      代表值樣本ID: group.referenceSamples.map((sample) => sample.id).join("、"),
      "代表值IQR上界(分鐘)": setupMinutes(group.upperFenceMs), 退回來源IQR排除ID: group.referenceOutliers.map((sample) => sample.id).join("、"),
      前製令單: [...new Set(group.samples.map((sample) => sample.previousOrder))].join("、"),
      後製令單: [...new Set(group.samples.map((sample) => sample.nextOrder))].join("、"),
      有效採用樣本數: group.adoptedCount,
      "本次分級估算值(分鐘)": estimate.minutes,
      估算來源: estimate.source, 估算等級: estimate.source === "manual_estimate" ? "人工暫估／待確認" : group.estimationLevel,
      ...setupCompactSummaryRow(group),
      "人工暫估設定(分鐘)": manual ? manual.minutes : "未設定",
      人工暫估套用狀態: manual ? estimate.source === "manual_estimate" ? "使用人工暫估（非歷史中位數）" : "僅保留設定，不套用於目前估算" : "未設定",
      人工暫估備註: manual ? manual.note : "", 人工暫估更新時間: manual ? manual.updatedAt : "",
      "A／B／C分類（本組候選）": ["A", "B", "C", "unknown"].map((value) => `${value}：${group.samples.filter((sample) => sample.operatorScenario === value).length}`).join("；"),
      日曆確認狀態: setupCalendarStatusSummary(group.samples),
      換模時間歸屬: Object.entries(SETUP_ATTRIBUTIONS).map(([value, label]) => `${label}：${group.samples.filter((sample) => getSetupReview(sample).attribution === value).length}`).join("；"),
      現場覆核狀態: Object.entries(SETUP_REVIEW_STATUSES).map(([value, label]) => `${label}：${group.samples.filter((sample) => getSetupReview(sample).status === value).length}`).join("；"),
      IQR欄位說明: "保留既有資格判定的上界與排除ID；分級估算只使用最終採用樣本，不重新篩選",
      人工覆核用途: "明細逐筆保存，與正式採用分開；不自動回寫排程或標準工時",
      本組長空檔提醒數: group.samples.filter((sample) => getSetupUnreportedRisk().samples.get(sample.id).status === "long_gap").length,
      本組未報工確認狀態: Object.entries(SETUP_UNREPORTED_STATUSES).map(([value, label]) => `${label}：${group.samples.filter((sample) => getSetupReview(sample).unreportedStatus === value).length}`).join("；"),
      參考來源已確認有未報工樣本ID: group.referenceSamples.filter((sample) => getSetupReview(sample).unreportedStatus === "confirmed_other_order").map((sample) => sample.id).join("、") || "未登錄",
      未報工引用提醒: "若來源样本已確認中間有未報工工單，不宜將整段空檔當換模；先人工檢查，未自動改變代表值",
    };
  }

  function renderHistoricalSetupSection() {
    const analysis = getHistoricalSetupAnalysis();
    renderSetupReviewSection(analysis);
    renderSetupUnreportedSection();
    fillSetupManualEditor(analysis.summaries.find((group) => group.key === state.setupManualGroupKey));
    const d = analysis.diagnostics;
    const cards = [["原始事件", d.rawEventCount], ["時間解析成功", d.parsedTimeCount], ["Pause", d.pauseCount], ["Start", d.startCount], ["Resume", d.resumeCount], ["End（不作起點）", d.endCount], ["觀察到同機台工單切換", d.switchCount], ["換模候選", d.candidateCount], ["排除候選", d.excludedCount], ["最終有效樣本", d.adoptedCount], ["產品切換組數", d.productGroupCount], ["無法配對事件（缺欄位／時間／動作）", d.skippedEventCount]];
    document.getElementById("setupAnalysisDiagnostics").innerHTML = cards.map(([label, count]) => `<div class="summary-card"><div class="summary-label">${escapeHtml(label)}</div><div class="summary-value">${count}</div></div>`).join("");
    const operatorCards = [["同一操作員候選", d.sameOperatorCount], ["不同人接手候選", d.differentOperatorCount], ["期間有他機報工候選", d.operatorWorkedOtherMachineCount], ["其中同人且有他機報工（C）", d.sameOperatorOtherMachineCount], ["人員資訊不足候選", d.unknownOperatorCount], ["A類採用樣本（僅操作員行為）", d.highConfidenceCount]];
    document.getElementById("setupAnalysisDiagnostics").innerHTML += operatorCards.map(([label, count]) => `<div class="summary-card"><div class="summary-label">${escapeHtml(label)}</div><div class="summary-value">${count}</div></div>`).join("");
    document.getElementById("setupAnalysisDiagnostics").innerHTML += Object.entries(d.calendarStatusCounts).map(([label, count]) => `<div class="summary-card"><div class="summary-label">日曆：${escapeHtml(label)}</div><div class="summary-value">${count}</div><div class="summary-detail">其中採用 ${d.adoptedCalendarStatusCounts[label]} 筆</div></div>`).join("");
    const machineHeaders = ["機台", "設備名稱", "候選數", "有效數", "排除數", "A類採用樣本數（僅操作員行為）", "機台參考中位數(分鐘)", "A類採用樣本中位數(分鐘)", "樣本數等級", "候選日曆確認狀態", "採用樣本日曆確認狀態"];
    document.getElementById("setupMachineAnalysisTable").innerHTML = analysis.machineSummaries.length ? `<p class="panel-note">此表固定顯示全部原始資料的機台統計，不受下方產品搜尋影響。機台參考值不是特定產品組合的實測中位數。A 類中位數僅按操作員行為比較，不代表出勤已確認，不替換全部有效中位數；請另看日曆確認狀態。無有效樣本顯示「無歷史資料」，不是 0 分鐘。</p><div class="table-shell"><table><thead><tr>${machineHeaders.map((label) => `<th>${escapeHtml(label)}</th>`).join("")}</tr></thead><tbody>${analysis.machineSummaries.map((machine) => {
      const samples = analysis.candidates.filter((sample) => sample.machineId === machine.machineId);
      return `<tr>${[machine.machineId, machine.machineName, machine.candidateCount, machine.adoptedCount, machine.excludedCount, machine.highConfidenceCount, machine.medianMs == null ? "無歷史資料" : setupMinutes(machine.medianMs), machine.highConfidenceMedianMs == null ? "無歷史資料" : setupMinutes(machine.highConfidenceMedianMs), machine.confidence, setupCalendarStatusSummary(samples), setupCalendarStatusSummary(samples.filter((sample) => sample.adopted))].map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`;
    }).join("")}</tbody></table></div>` : `<div class="empty-card">尚無機台換模候選。</div>`;
    const keyword = normalizeSearchText(state.setupSearchTerm);
    const groups = analysis.summaries.filter((group) => !keyword || [group.machineId, group.machineName, group.previousProduct, group.nextProduct, ...group.samples.flatMap((sample) => [sample.previousOrder, sample.nextOrder])].some((value) => normalizeSearchText(value).includes(keyword)));
    const pageCount = Math.max(1, Math.ceil(groups.length / 25));
    state.setupPage = Math.max(1, Math.min(state.setupPage, pageCount));
    document.getElementById("setupAnalysisPagination").hidden = pageCount <= 1;
    document.getElementById("setupPageLabel").textContent = `第 ${state.setupPage} / ${pageCount} 頁`;
    document.getElementById("setupPrevBtn").disabled = state.setupPage <= 1;
    document.getElementById("setupNextBtn").disabled = state.setupPage >= pageCount;
    document.getElementById("exportSetupAnalysisBtn").disabled = !state.rawRows.length;
    const issues = analysis.pairingIssues.map((issue) => ({ 原始列號: issue.rowNumber, 機台: issue.machineId || "未提供", 製令單: issue.order || "未提供", 動作: issue.action || "未提供", 時間: issue.time ? formatDateTime(issue.time) : "無法解析", 待確認原因: issue.reason }));
    document.getElementById("setupPairingIssues").innerHTML = issues.length ? `<p>共 ${issues.length} 筆，不強行補事件或推算。</p><div class="table-shell setup-sample-table"><table><thead><tr>${Object.keys(issues[0]).map((key) => `<th>${escapeHtml(key)}</th>`).join("")}</tr></thead><tbody>${issues.map((row) => `<tr>${Object.values(row).map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : "沒有無法配對事件。";
    const unconfirmed = analysis.candidates.filter((sample) => !sample.calendarGap.calendarConfirmed).length;
    const calendarNote = `${unconfirmed ? `${unconfirmed} 筆候選：政府年度日曆資料未確認。` : "已套用官方年度假日（含補假），不代表已確認出勤。"} ${state.setupCalendar.confirmed ? "工廠例外已人工核對，仍須逐筆出勤與機台佐證。" : "工廠行事曆尚未完整，請核對實際出勤及機台例外。"} 採用樣本日曆：${setupCalendarStatusSummary(analysis.candidates.filter((sample) => sample.adopted))}。A／B／C 僅表示操作員行為，並非整體換模時間可信度。週六僅有報工不推定整天工作。扣除依序為週日、日曆未確認、國定假日、週六未確認、非工作時段、休息；每段只歸屬一項。`;
    document.getElementById("setupAnalysisNote").textContent = `${calendarNote} 跨日樣本不納入代表值。顯示 ${groups.length} / ${analysis.summaries.length} 組；另有 ${d.missingPauseCount} 次切換缺少 Pause、${d.missingActivationCount} 段缺少 Start / Resume，未建立候選。`;
    const container = document.getElementById("setupAnalysisTable");
    if (!groups.length) {
      container.innerHTML = `<div class="empty-card">${state.rawRows.length ? "目前沒有符合條件的換模候選組別。請檢查原始事件或搜尋條件。" : "匯入原始報工資料後，這裡會自動建立換模候選。"}</div>`;
      return;
    }
    const displayGroups = groups.slice((state.setupPage - 1) * 25, state.setupPage * 25);
    const summaryHeaders = Object.keys(setupSummaryExportRow(displayGroups[0], state.setupCalendar)).filter((header) => !["代表值樣本ID", "代表值IQR上界(分鐘)", "退回來源IQR排除ID"].includes(header));
    const compactHeaders = Object.keys(setupCompactSummaryRow(displayGroups[0]));
    container.innerHTML = `<div class="table-shell setup-summary-table"><table><thead><tr>${compactHeaders.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${displayGroups.map((group) => {
      const row = setupSummaryExportRow(group, state.setupCalendar);
      const compact = setupCompactSummaryRow(group);
      const detailHeaders = Object.keys(setupSampleExportRow(group.samples[0]));
      const manualButton = canUseSetupManualEstimate(group) ? `<button type="button" class="link-button" data-setup-manual-key="${escapeHtml(group.key)}">${state.setupManualEstimates.has(group.key) ? "修改人工暫估" : "輸入人工暫估"}</button>` : "";
      return `<tr class="setup-compact-row">${compactHeaders.map((header) => `<td>${escapeHtml(compact[header])}${header === "預估換模分鐘數" && manualButton ? `<div>${manualButton}</div>` : ""}</td>`).join("")}</tr><tr class="setup-detail-row"><td colspan="${compactHeaders.length}"><details class="setup-sample-details"><summary>詳細資訊：${group.candidateCount} 筆候選、A／B／C、日曆與人工覆核</summary>
        <p>產品組合有效樣本 ${group.productSampleCount} 筆；產品組合候選中位數（分鐘）：${escapeHtml(row["產品組合候選中位數(分鐘)"])}。</p>
        <p>${escapeHtml(row.參考值來源說明)}。參考來源有效樣本 ${group.referenceSampleCount} 筆；採用參考中位數（分鐘）：${escapeHtml(row["採用參考中位數(分鐘)"])}。${escapeHtml(row.代表值適用限制)}。</p>
        <p>本次分級估算值（分鐘）：${escapeHtml(row["本次分級估算值(分鐘)"])}；估算等級：${escapeHtml(row.估算等級)}。人工覆核不會改變採用判定；可在各筆候選右方點選「覆核」。</p>
        <p>代表值樣本：${escapeHtml(row.代表值樣本ID || "無")}。</p>
        <p>退回來源另經 IQR 排除：${escapeHtml(row.退回來源IQR排除ID || "無")}。</p>
        <details><summary>完整統計與人工設定</summary><dl class="setup-detail-fields">${summaryHeaders.map((header) => `<div><dt>${escapeHtml(header)}</dt><dd>${escapeHtml(row[header])}</dd></div>`).join("")}</dl></details>
        <div class="table-shell setup-sample-table" tabindex="0"><table><thead><tr>${detailHeaders.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}<th>人工覆核</th></tr></thead><tbody>${group.samples.map((sample) => `<tr>${Object.values(setupSampleExportRow(sample)).map((value) => `<td>${escapeHtml(value)}</td>`).join("")}<td><button type="button" class="link-button" data-setup-review-id="${escapeHtml(sample.id)}">覆核</button></td></tr>`).join("")}</tbody></table></div>
      </details></td></tr>`;
    }).join("")}</tbody></table></div>`;
  }

  async function exportSetupAnalysisReport() {
    if (!state.rawRows.length) { setMessage("目前沒有可分析的原始報工紀錄。", "error"); return; }
    try {
      const analysis = getHistoricalSetupAnalysis();
      const workbook = createExcelWorkbook();
      appendSheet(workbook, "換模時間彙總", analysis.summaries.map((group) => setupSummaryExportRow(group, state.setupCalendar)));
      appendSheet(workbook, "換模樣本明細", analysis.candidates.map(setupSampleExportRow));
      appendSheet(workbook, "短時間候選待覆核", analysis.candidates.filter(isSetupShortReviewCandidate).map(setupShortReviewRow));
      appendSheet(workbook, "事件待確認", analysis.pairingIssues.map((issue) => ({ 原始列號: issue.rowNumber, 機台: issue.machineId, 製令單: issue.order, 動作: issue.action, 時間: issue.time ? formatDateTime(issue.time) : "無法解析", 待確認原因: issue.reason })));
      appendSheet(workbook, "未報工風險待覆核", analysis.candidates.map(setupUnreportedRow));
      const risk = getSetupUnreportedRisk();
      appendSheet(workbook, "未報工確認影響組合", analysis.candidates.filter((sample) => getSetupReview(sample).unreportedStatus === "confirmed_other_order")
        .flatMap((sample) => (risk.references.get(sample.id) || []).map((group) => setupUnreportedImpactRow(sample, group))));
      await saveExcelWorkbook(workbook, "MES歷史推估換模時間分析.xlsx");
      setMessage(`已匯出 ${analysis.summaries.length} 組換模彙總、${analysis.candidates.length} 筆候選；此為歷史推估，非正式量測換模時間。`, "info");
    } catch (error) {
      setMessage(error.message || "換模分析匯出失敗。", "error");
    }
  }

  function renderArchiveSection(scoped) {
    const container = document.getElementById("archiveSection");
    if (!container) {
      return;
    }

    const archiveData = state.archiveData || { archiveSummary: [], archivedOrdersByYear: {}, archivedByYear: {}, activeRecords: [] };
    const yearOptions = archiveData.archiveSummary || [];

    if (!state.validRecords.length) {
      container.innerHTML = `<div class="empty-card">匯入資料後，這裡會自動依最後一筆有效 End 的年份建立歷史資料歸檔。</div>`;
      return;
    }

    if (!yearOptions.length) {
      container.innerHTML = `
        <div class="detail-summary-grid">
          <div class="detail-summary-item">
            <strong>目前主資料</strong>
            <span>${buildWorkOrders(archiveData.activeRecords || []).length} 張未結案製令單</span>
            <span>${(archiveData.activeRecords || []).length} 筆資料</span>
          </div>
          <div class="detail-summary-item">
            <strong>歷史歸檔年度</strong>
            <span>目前沒有已結案資料</span>
            <span>只要有有效 End，就會自動歸檔到對應年度。</span>
          </div>
        </div>
      `;
      return;
    }

    const selectedYear = yearOptions.some((item) => String(item.year) === cleanString(state.selectedArchiveYear))
      ? cleanString(state.selectedArchiveYear)
      : String(yearOptions[0].year);
    if (selectedYear !== state.selectedArchiveYear) {
      state.selectedArchiveYear = selectedYear;
    }

    const selectedSummary = yearOptions.find((item) => String(item.year) === selectedYear) || yearOptions[0];
    const selectedOrders = archiveData.archivedOrdersByYear[selectedYear] || [];
    const selectedOrderRows = selectedOrders
      .map(
        (order) => `
          <tr>
            <td class="mono primary-text">${escapeHtml(order.workOrderNo)}</td>
            <td>${escapeHtml(order.productSpec || "")}</td>
            <td>${displayValue(order.quantity)}</td>
            <td>${escapeHtml((order.machineRoute || []).join(" → ") || "尚未形成流程")}</td>
            <td class="mono">${formatDuration(order.totalProcessingMs)}</td>
            <td class="mono">${formatDuration(order.totalWaitingMs)}</td>
            <td class="mono">${formatDuration(order.leadTimeMs)}</td>
            <td class="mono">${formatDateTime(order.archiveEndedAt || order.finishedAt)}</td>
            <td><span class="chip complete">${escapeHtml(order.statusLabel || "已結案")}</span></td>
          </tr>
        `
      )
      .join("");

    const optionHtml = yearOptions
      .map(
        (item) => `<option value="${escapeHtml(String(item.year))}" ${String(item.year) === selectedYear ? "selected" : ""}>${escapeHtml(String(item.year))}年度資料</option>`
      )
      .join("");

    container.innerHTML = `
      <div class="detail-summary-grid">
        <div class="detail-summary-item">
          <strong>目前主資料</strong>
          <span>${buildWorkOrders(archiveData.activeRecords || []).length} 張未結案製令單</span>
          <span>${(archiveData.activeRecords || []).length} 筆資料</span>
        </div>
        <div class="detail-summary-item">
          <strong>${escapeHtml(selectedYear)}年度已結案製令單</strong>
          <span>${selectedSummary.workOrderCount} 張</span>
          <span>${selectedSummary.recordCount} 筆資料</span>
        </div>
        <div class="detail-summary-item">
          <strong>${escapeHtml(selectedYear)}年度總加工工時</strong>
          <span>${formatDuration(selectedSummary.totalProcessingMs)}</span>
        </div>
        <div class="detail-summary-item">
          <strong>${escapeHtml(selectedYear)}年度總等待工時</strong>
          <span>${formatDuration(selectedSummary.totalWaitingMs)}</span>
        </div>
        <div class="detail-summary-item">
          <strong>${escapeHtml(selectedYear)}年度平均 Lead Time</strong>
          <span>${formatDuration(selectedSummary.averageLeadTimeMs)}</span>
        </div>
      </div>
      <div class="range-panel archive-panel">
        <div class="range-control-grid">
          <div class="field-box compact">
            <label for="archiveYearSelect">年度</label>
            <select id="archiveYearSelect" class="search-input">${optionHtml}</select>
          </div>
          <div class="field-box compact">
            <label for="includeArchiveToggle">分析選項</label>
            <div class="checkbox-row">
              <input id="includeArchiveToggle" type="checkbox" ${scoped.includeArchiveInAnalysis ? "checked" : ""} />
              <span>包含歷史資料一起分析</span>
            </div>
          </div>
          <div class="range-action-box">
            <button id="viewArchiveYearBtn" class="btn-secondary" type="button">查看 ${escapeHtml(selectedYear)} 年度資料</button>
            <button id="exportArchiveYearBtn" class="btn-primary" type="button">匯出 ${escapeHtml(selectedYear)} 年度歷史資料 Excel</button>
          </div>
        </div>
        <div class="foot-note">年度會依資料中的最後一筆有效 End 自動建立，不會寫死年份。若勾選包含歷史資料一起分析，主畫面 KPI、流程與品名規格 Lead Time 表會改用主資料 + 所選年度歷史資料。</div>
      </div>
      <div class="table-shell nested-table-shell">
        <table>
          <thead>
            <tr>
              <th>製令單號</th>
              <th>品名規格</th>
              <th>數量</th>
              <th>機台流程</th>
              <th>總加工工時</th>
              <th>總等待工時</th>
              <th>Lead Time</th>
              <th>最後完成時間</th>
              <th>狀態</th>
            </tr>
          </thead>
          <tbody>${selectedOrderRows || '<tr><td colspan="9">目前沒有該年度的歷史資料。</td></tr>'}</tbody>
        </table>
      </div>
    `;
  }

  function renderMessage() {
    const box = document.getElementById("messageBox");
    if (!state.message) {
      box.style.display = "none";
      box.textContent = "";
      box.className = "message-box";
      return;
    }

    box.style.display = "block";
    box.textContent = state.message;
    box.className = state.messageType === "error" ? "message-box error" : "message-box";
  }

    function renderFlowTable(view) {
    const container = document.getElementById("flowTable");
    if (!state.validRecords.length) {
      container.innerHTML = `<div class="empty-card">尚未載入資料。上傳 Excel 或貼上 TSV 後，這裡會整理每張製令單的機台流程、每站加工工時、站間等待與完成狀態。</div>`;
      return;
    }

    if (!view.filteredWorkOrders.length) {
      container.innerHTML = `<div class="empty-card">目前篩選條件下沒有製令單資料。</div>`;
      return;
    }

    const rows = view.filteredWorkOrders
      .map((order) => {
        const machineRouteText = order.machineRoute.length ? order.machineRoute.join(" → ") : "尚未形成機台流程";
        const machineSummaryLines = order.machineWorkSummary.length
          ? order.machineWorkSummary
              .map(
                (machine) => `
                  <div class="stack-line">
                    <strong>${escapeHtml(machine.stationName)}</strong>
                    <div>總加工工時：${formatDuration(machine.processingHours)}</div>
                    <div>內含加工段數：${machine.segments.length} 段</div>
                    ${machine.hasMissedPauseWarning ? '<div class="foot-note">⚠ 疑似漏按暫停</div>' : ""}
                  </div>
                `
              )
              .join("")
          : `<div class="stack-line">尚未形成機台流程</div>`;

        const stationWaitingLines = order.stationTransitions.length
          ? order.stationTransitions
              .map(
                (transition) => `
                  <div class="stack-line compact">
                    <strong>${escapeHtml(transition.fromStation)}</strong>
                    <div>→ ${escapeHtml(transition.toStation)}</div>
                    <div>等待：${formatDuration(transition.waitingMs)}</div>
                  </div>
                `
              )
              .join("")
          : `<div class="stack-line compact">同機台續工不產生站間等待</div>`;
        const waitingSummaryNote = order.stationTransitions.length
          ? `共 ${order.stationTransitions.length} 筆等待｜總等待工時 ${formatDuration(order.totalWaitingMs)}`
          : "共 0 筆等待｜總等待工時 0:00:00";

        const stationAnalysisCards = order.stationAnalysis.length
          ? order.stationAnalysis
              .map(
                (station) => `
                  <div class="station-analysis-card">
                    <div class="station-analysis-top">
                      <strong>${escapeHtml(station.stationName)}</strong>
                      <span class="chip manual">${station.segmentCount} 段</span>
                    </div>
                    <div class="station-analysis-metrics">
                      <span>總加工工時：${formatDuration(station.processingHours)}</span>
                      <span>平均單段工時：${formatDuration(station.averageSegmentMs)}</span>
                      <span>機台標準工時：${formatDuration(station.machineStandardHours)}</span>
                      <span>機台利用率：${formatPercentage(resolveDisplayUtilization(station))}</span>
                      <span>Pause ${station.pauseCount} 次</span>
                      <span>Resume ${station.resumeCount} 次</span>
                      ${station.missedPauseWarning ? '<span>⚠ 疑似漏按暫停</span>' : ""}
                    </div>
                    <details class="inline-details">
                      <summary>展開原始加工段</summary>
                      <div class="stack-lines">
                        ${(station.segments || [])
                          .map(
                            (segment) => `
                              <div class="stack-line">
                                <strong>${segment.segmentNo}. ${formatDateTime(segment.startAt)} → ${formatDateTime(segment.endAt)}</strong>
                                <div>${escapeHtml(segment.startStatus)} → ${escapeHtml(segment.endStatus)}｜加工 ${formatDuration(segment.processingMs)}｜${escapeHtml(segment.operator || "未填操作員")}</div>
                              </div>
                            `
                          )
                          .join("") || '<div class="stack-line">目前沒有可顯示的加工段。</div>'}
                        ${station.missedPauseWarning ? `<div class="foot-note">⚠ ${escapeHtml(station.missedPauseWarning.reason)}｜超出 ${formatDuration(station.missedPauseWarning.exceededMs)}</div>` : ""}
                      </div>
                    </details>
                  </div>
                `
              )
              .join("")
          : `<div class="empty-card compact-empty">目前沒有機台加工彙總。</div>`;

        const waitingTableRows = order.stationTransitions.length
          ? order.stationTransitions
              .map(
                (transition) => `
                  <tr>
                    <td>${escapeHtml(transition.fromStation)}</td>
                    <td>${escapeHtml(transition.toStation)}</td>
                    <td class="mono">${formatDateTime(transition.fromEndTime)}</td>
                    <td class="mono">${formatDateTime(transition.toStartTime)}</td>
                    <td class="mono">${formatDuration(transition.waitingMs)}</td>
                  </tr>
                `
              )
              .join("")
          : `<tr><td colspan="5">同機台續工不產生站間等待，目前沒有跨機台等待資料。</td></tr>`;

        const rawLines = order.rawRecords
          .map(
            (record) =>
              `<div>${formatDateTime(record.recordedAt)}｜${escapeHtml(record.actionStatus)}｜${escapeHtml(composeMachineLabel(record.machineId, record.machineName) || "未填機台")}｜${escapeHtml(record.operator || "未填操作員")}</div>`
          )
          .join("");

        const statusClass = order.hasAnomaly ? "anomaly" : order.completed ? "complete" : "pending";
        const notes = order.notes.length ? `<div class="foot-note">備註：${escapeHtml(order.notes.join("；"))}</div>` : "";
        const anomalyText = order.anomalies.length ? `<div class="foot-note">異常提示：${escapeHtml(order.anomalies.join("；"))}</div>` : "";
        const flowHint = order.flowHint ? `<div class="foot-note">流程提示：${escapeHtml(order.flowHint)}</div>` : "";
        const utilizationNote = order.utilizationNote ? `<div class="foot-note">利用率說明：${escapeHtml(order.utilizationNote)}</div>` : "";
        const missedPauseText = order.hasMissedPauseWarning ? `<div class="foot-note">⚠ 疑似漏按暫停：${order.missedPauseWarnings.map((item) => `${item.machineLabel}｜${item.reason}`).join("；")}</div>` : "";
        const exportButton = `<button class="btn-secondary btn-inline" type="button" data-export-work-order="${escapeHtml(order.workOrderNo)}">匯出目前工單</button>`;

        return `
          <tr>
            <td class="mono primary-text">${escapeHtml(order.workOrderNo)}</td>
            <td>
              <div class="primary-text">${escapeHtml(order.productSpec || "未填品名規格")}</div>
              <div>數量：${escapeHtml(displayValue(order.quantity))}</div>
              <div class="foot-note">母件編號：${escapeHtml(order.parentItemNo || "未填")}</div>
              <div class="foot-note">需求料件：${escapeHtml(order.requiredItem || "未填")}</div>
            </td>
            <td class="route-text">${escapeHtml(machineRouteText)}</td>
            <td><div class="stack-lines">${machineSummaryLines}</div></td>
            <td>
              <div class="stack-lines">${stationWaitingLines}</div>
              <div class="foot-note">${escapeHtml(waitingSummaryNote)}</div>
            </td>
            <td class="mono">${formatDuration(order.totalProcessingMs)}</td>
            <td class="mono">${formatDuration(order.totalWaitingMs)}</td>
            <td class="mono">${formatDuration(order.averageWaitingMs)}</td>
            <td class="mono">${formatPercentage(order.utilizationWithHoliday)}</td>
            <td class="mono">${formatPercentage(order.utilizationWithoutHoliday)}</td>
            <td class="mono">${formatDuration(order.leadTimeMs)}</td>
            <td class="mono">${formatDuration(order.totalTimeWithAllowance)}</td>
            <td>
              <div class="chip ${statusClass}">${escapeHtml(order.statusLabel)}</div>
              ${order.hasMissedPauseWarning ? '<div class="chip pending">⚠ 疑似漏按暫停</div>' : ""}
              ${flowHint}
              ${notes}
              ${missedPauseText}
              ${utilizationNote}
              ${anomalyText}
              <details class="inline-details">
                <summary>查看工單詳細分析</summary>
                <div class="detail-panel-grid">
                  <div class="detail-panel-card">
                    <div class="detail-panel-title">第一區：機台加工彙總</div>
                    <div class="station-analysis-grid">${stationAnalysisCards}</div>
                  </div>
                  <div class="detail-panel-card">
                    <div class="detail-panel-title">第二區：各站等待分析</div>
                    <div class="foot-note">機台切換次數：${order.stationTransitions.length} 次｜總等待工時：${formatDuration(order.totalWaitingMs)}</div>
                    <div class="table-shell nested-table-shell">
                      <table>
                        <thead>
                          <tr>
                            <th>上一站</th>
                            <th>下一站</th>
                            <th>等待開始時間</th>
                            <th>等待結束時間</th>
                            <th>等待工時</th>
                          </tr>
                        </thead>
                        <tbody>${waitingTableRows}</tbody>
                      </table>
                    </div>
                  </div>
                  <div class="detail-panel-card">
                    <div class="detail-panel-title">第三區：總計</div>
                    <div class="detail-summary-grid">
                      <div class="detail-summary-item"><strong>總加工工時</strong><span>${formatDuration(order.totalProcessingMs)}</span></div>
                      <div class="detail-summary-item"><strong>總等待工時</strong><span>${formatDuration(order.totalWaitingMs)}</span></div>
                      <div class="detail-summary-item"><strong>Lead Time</strong><span>${formatDuration(order.leadTimeMs)}</span></div>
                      <div class="detail-summary-item"><strong>總時間含寬放 1.3</strong><span>${formatDuration(order.totalTimeWithAllowance)}</span></div>
                      <div class="detail-summary-item"><strong>流程利用率</strong><span>${formatPercentage(order.flowUtilization)}</span></div>
                      <div class="detail-summary-item"><strong>機台利用率(含假日)</strong><span>${formatPercentage(order.utilizationWithHoliday)}</span></div>
                      <div class="detail-summary-item"><strong>機台利用率(不含假日)</strong><span>${formatPercentage(order.utilizationWithoutHoliday)}</span></div>
                      <div class="detail-summary-item"><strong>目前狀態</strong><span>${escapeHtml(order.statusLabel)}</span></div>
                    </div>
                    <div class="action-row detail-action-row">${exportButton}</div>
                  </div>
                  <div class="detail-panel-card detail-panel-wide">
                    <div class="detail-panel-title">原始掃描紀錄</div>
                    <div class="foot-note raw-log">${rawLines}</div>
                  </div>
                </div>
              </details>
            </td>
          </tr>
        `;
      })
      .join("");

    container.innerHTML = `
      <div class="table-shell flow-table-shell">
        <table>
          <thead>
            <tr>
              <th>製令單號</th>
              <th>品名規格 / 數量</th>
              <th>機台流程</th>
              <th>機台加工彙總</th>
              <th>各站等待分析</th>
              <th>總加工工時</th>
              <th>總等待工時</th>
              <th>平均等待時間</th>
              <th>利用率(含假日)</th>
              <th>利用率(不含假日)</th>
              <th>Lead Time</th>
              <th>總時間含寬放 1.3</th>
              <th>目前狀態</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

    function renderStandardTable(view) {
    const container = document.getElementById("standardTable");
    if (!state.validRecords.length) {
      container.innerHTML = `<div class="empty-card">目前還沒有可建立品名規格 Lead Time 表的資料。只有最後有 End 的完成製令單，才會依品名規格納入平均 Lead Time。</div>`;
      return;
    }

    if (!view.filteredStandards.length) {
      container.innerHTML = `<div class="empty-card">目前沒有可建立品名規格 Lead Time 表的完成製令單。只有最後有 End 的製令單，才會依品名規格納入平均 Lead Time。</div>`;
      return;
    }

    const rows = view.filteredStandards
      .map(
        (item) => `
          <tr>
            <td class="primary-text">${escapeHtml(item.productSpec)}</td>
            <td class="mono">${item.completedCount}</td>
            <td class="mono">${formatDuration(item.avgProcessingMs)}</td>
            <td class="mono">${formatDuration(item.avgWaitingMs)}</td>
            <td class="mono">${formatDuration(item.avgLeadTimeMs)}</td>
            <td class="mono primary-text">${formatDuration(item.suggestedScheduleMs)}</td>
            <td>${item.canSchedule ? '<span class="chip complete">可用於排程</span>' : '<span class="chip manual">資料不足</span>'}</td>
          </tr>
        `
      )
      .join("");

    container.innerHTML = `
      <div class="table-shell">
        <table>
          <thead>
            <tr>
              <th>品名規格</th>
              <th>完成樣本數</th>
              <th>平均加工工時</th>
              <th>平均等待工時</th>
              <th>平均 Lead Time</th>
              <th>建議排程工時</th>
              <th>是否可用於排程</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

    function renderScheduleTable(view) {
    const container = document.getElementById("scheduleTable");
    if (!state.validRecords.length) {
      container.innerHTML = `<div class="empty-card">尚未載入資料，還不能產生排程預估。</div>`;
      return;
    }

    if (!view.filteredScheduleRows.length) {
      container.innerHTML = `<div class="empty-card">目前沒有新製令單或未完成製令單需要排程預估。</div>`;
      return;
    }

    const rows = view.filteredScheduleRows
      .map(
        (row) => `
          <tr>
            <td class="mono primary-text">${escapeHtml(row.workOrderNo)}</td>
            <td>
              <div class="primary-text">${escapeHtml(row.productSpec || "未填品名規格")}</div>
              <div>數量：${escapeHtml(displayValue(row.quantity))}</div>
            </td>
            <td>${escapeHtml(row.statusLabel)}</td>
            <td class="mono">${formatDuration(row.accumulatedProcessingMs)}</td>
            <td class="mono">${formatDuration(row.accumulatedWaitingMs)}</td>
            <td class="mono">${row.estimatedProcessingMs == null ? "需要人工估時" : formatDuration(row.estimatedProcessingMs)}</td>
            <td class="mono">${row.estimatedWaitingMs == null ? "需要人工估時" : formatDuration(row.estimatedWaitingMs)}</td>
            <td class="mono">${row.remainingMs == null ? "需要人工估時" : formatDuration(row.remainingMs)}</td>
            <td><span class="chip ${escapeHtml(row.noteType)}">${escapeHtml(row.note)}</span></td>
            <td>${row.noteType === "manual" ? "請主管或工程人員人工估時" : "已套用歷史平均標準工時"}</td>
          </tr>
        `
      )
      .join("");

    container.innerHTML = `
      <div class="table-shell">
        <table>
          <thead>
            <tr>
              <th>製令單號</th>
              <th>品名規格 / 數量</th>
              <th>目前狀態</th>
              <th>已累積加工工時</th>
              <th>已累積等待工時</th>
              <th>預估總加工工時</th>
              <th>預估總等待工時</th>
              <th>預估剩餘工時</th>
              <th>排程建議</th>
              <th>備註</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  function renderWaitingAnalytics(view) {
    const container = document.getElementById("waitingAnalytics");
    if (!state.validRecords.length) {
      container.innerHTML = `<div class="empty-card">尚未載入資料，等待分析會在匯入後自動產生。</div>`;
      return;
    }

    const analytics = view.filteredWaitingAnalytics;
    const detailRows = analytics.stationDetails
      .map(
        (item) => `
          <tr>
            <td class="mono primary-text">${escapeHtml(item.workOrderNo)}</td>
            <td>${escapeHtml(item.machineLabel)}</td>
            <td>${escapeHtml(item.nextMachineLabel || "下一站")}</td>
            <td class="mono">${formatDateTime(item.startAt)}</td>
            <td class="mono">${formatDateTime(item.endAt)}</td>
            <td class="mono">${formatDuration(item.waitingMs)}</td>
            <td>${escapeHtml(item.valveType)}</td>
          </tr>
        `
      )
      .join("");

    const machineRows = analytics.machineUtilizationRank
      .map(
        (item) => `
          <tr>
            <td>${escapeHtml(item.label)}</td>
            <td class="mono">${formatDuration(item.processingMs)}</td>
            <td class="mono">${formatDuration(item.waitingMs)}</td>
            <td class="mono">${formatDuration(item.averageProcessingMs || 0)}</td>
            <td class="mono">${formatDuration(item.availableHoursMs)}</td>
            <td class="mono">${formatPercentage(item.utilizationWithHoliday)}</td>
            <td class="mono">${formatPercentage(item.value)}</td>
          </tr>
        `
      )
      .join("");

    const utilizationFormulaPanel = `
      <details class="formula-card" open>
        <summary>計算公式說明</summary>
        <div class="formula-card-body">
          <div class="formula-grid">
            <div class="formula-item">
              <strong>機台利用率(含假日)</strong>
              <p class="formula-expression">機台加工工時 ÷ 機台可用工時(含假日) × 100%</p>
              <p>分子：該機台在本期間的總加工工時。</p>
              <p>分母：查詢區間天數 × 每日可用工時設定值，假日也列入。</p>
              <p>用途：分析機台在完整期間內的忙碌程度。</p>
            </div>
            <div class="formula-item">
              <strong>機台利用率(不含假日)</strong>
              <p class="formula-expression">機台加工工時 ÷ 機台可用工時(不含假日) × 100%</p>
              <p>分子：該機台在本期間的總加工工時。</p>
              <p>分母：工作日可用工時；假日預設不列入，但假日若有加工紀錄會保留該日。</p>
              <p>用途：分析正常工作日下的機台負荷程度。</p>
            </div>
            <div class="formula-item">
              <strong>可用工時說明</strong>
              <p class="formula-expression">查詢區間天數 × 每日可用工時設定值</p>
              <p>目前每日可用工時設定：${displayValue(state.utilizationConfig.dailyHours)} 小時。</p>
              <p>範例：30 天 × 8 小時 = 240 小時；31 天 × 8 小時 = 248 小時。</p>
              <p>目前不是 24 小時制，也不是固定工作日寫死演算法。</p>
            </div>
            <div class="formula-item">
              <strong>超過 100% 的目前處理</strong>
              <p class="formula-expression">calculateRatio() 會把大於 100% 的結果封頂顯示為 100%</p>
              <p>因此 150%、180%、200% 目前都會顯示為 100%。</p>
              <p>若後續要改為顯示真實值，可再另外調整畫面與分級邏輯。</p>
            </div>
          </div>
          <div class="foot-note">此區顯示的是機台忙碌程度與負荷參考，不是 OEE，也不是設備稼動率。</div>
        </div>
      </details>
    `;

    container.innerHTML = `
      ${utilizationFormulaPanel}
      <div class="analytics-grid">
        ${renderBarCard("各機台等待時間排行", analytics.machineWaitingRank.slice(0, 10), "duration")}
        ${renderBarCard("站間等待 TOP10", analytics.stationWaitingRank.map((item) => ({
          label: `${item.workOrderNo} / ${item.machineLabel} → ${item.nextMachineLabel || "下一站"}`,
          value: item.waitingMs,
        })), "duration")}
        ${renderBarCard("各閥類平均等待時間", analytics.valveWaitingRank.map((item) => ({ label: item.label, value: item.value })), "duration")}
        ${renderBarCard("機台利用率排行", analytics.machineUtilizationRank.map((item) => ({ label: item.label, value: item.value })), "percent")}
      </div>
      <div class="detail-panel-grid analytics-detail-grid">
        <div class="detail-panel-card detail-panel-wide">
          <div class="detail-panel-title">各站等待分析</div>
          <div class="table-shell nested-table-shell">
            <table>
              <thead>
                <tr>
                  <th>製令單號</th>
                  <th>上一站</th>
                  <th>下一站</th>
                  <th>等待開始時間</th>
                  <th>等待結束時間</th>
                  <th>站間等待時間</th>
                  <th>閥類</th>
                </tr>
              </thead>
              <tbody>${detailRows || '<tr><td colspan="7">目前沒有跨機台等待資料。</td></tr>'}</tbody>
            </table>
          </div>
        </div>
        <div class="detail-panel-card detail-panel-wide">
          <div class="detail-panel-title">各機台利用率</div>
          <div class="table-shell nested-table-shell">
            <table>
              <thead>
                <tr>
                  <th>機台</th>
                  <th>機台加工工時</th>
                  <th>機台等待工時</th>
                  <th>機台標準工時</th>
                  <th>機台可用工時</th>
                  <th>機台利用率(含假日)</th>
                  <th>機台利用率(不含假日)</th>
                </tr>
              </thead>
              <tbody>${machineRows || '<tr><td colspan="7">目前沒有機台利用率資料。</td></tr>'}</tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  function renderMissedPauseAnalysisSection(view) {
    const container = document.getElementById("missedPauseAnalysisSection");
    if (!container) {
      return;
    }

    if (!state.validRecords.length) {
      container.innerHTML = `<div class="empty-card">匯入資料後，這裡會列出疑似漏按暫停的加工段，供主管追蹤與教育訓練使用。</div>`;
      return;
    }

    const analysis = view.filteredMissedPauseAnalysis || { warningRows: [], operatorRanking: [] };
    const detailRows = (analysis.warningRows || [])
      .map(
        (item) => `
          <tr>
            <td class="mono primary-text">${escapeHtml(item.workOrderNo)}</td>
            <td>${escapeHtml(item.productSpec || "")}</td>
            <td>${escapeHtml(item.machineLabel)}</td>
            <td>${escapeHtml(item.operator)}</td>
            <td class="mono">${formatDateTime(item.startAt)}</td>
            <td class="mono">${formatDateTime(item.endAt)}</td>
            <td class="mono">${formatDuration(item.processingMs)}</td>
            <td class="mono">${formatDuration(item.exceededMs)}</td>
            <td>⚠ ${escapeHtml(item.reason)}</td>
          </tr>
        `
      )
      .join("");

    const rankingRows = (analysis.operatorRanking || [])
      .map(
        (item) => `
          <tr>
            <td><button class="link-button" type="button" data-operator-link="${escapeHtml(item.operator)}">${escapeHtml(item.operator)}</button></td>
            <td>${item.warningCount} 次</td>
            <td>${item.workOrderCount} 張</td>
            <td class="mono">${formatDuration(item.totalProcessingMs)}</td>
            <td class="mono">${formatDuration(item.maxProcessingMs)}</td>
          </tr>
        `
      )
      .join("");

    const formulaPanel = `
      <details class="formula-card" open>
        <summary>計算公式說明</summary>
        <div class="formula-card-body">
          <div class="formula-grid">
            <div class="formula-item">
              <strong>疑似漏按暫停判定</strong>
              <p class="formula-expression">Start → Pause 或 Resume → Pause 超過 12 小時</p>
              <p>僅針對人工操作設備檢查，設備名稱包含 CNC 時自動排除。</p>
              <p>此功能只做警示，不修改原始工時、Lead Time、等待工時與利用率。</p>
            </div>
            <div class="formula-item">
              <strong>不納入平均</strong>
              <p class="formula-expression">疑似漏按暫停資料不納入平均工時與排程歷史平均</p>
              <p>包含：品名規格 Lead Time 表、平均加工工時、機台平均加工時間、排程預估的歷史平均。</p>
              <p>原始資料仍完整保留，可用於教育訓練與追蹤。</p>
            </div>
          </div>
        </div>
      </details>
    `;

    container.innerHTML = `
      ${formulaPanel}
      <div class="detail-panel-grid analytics-detail-grid">
        <div class="detail-panel-card">
          <div class="detail-panel-title">疑似漏按暫停排行</div>
          <div class="table-shell nested-table-shell">
            <table>
              <thead>
                <tr>
                  <th>人員</th>
                  <th>發生次數</th>
                  <th>涉及工單數</th>
                  <th>累計本次工時</th>
                  <th>最長單段工時</th>
                </tr>
              </thead>
              <tbody>${rankingRows || '<tr><td colspan="5">目前沒有疑似漏按暫停排行。</td></tr>'}</tbody>
            </table>
          </div>
        </div>
        <div class="detail-panel-card detail-panel-wide">
          <div class="detail-panel-title">疑似漏按暫停明細</div>
          <div class="table-shell nested-table-shell">
            <table>
              <thead>
                <tr>
                  <th>工單號</th>
                  <th>品名規格</th>
                  <th>機台</th>
                  <th>操作人員</th>
                  <th>開始時間</th>
                  <th>結束時間</th>
                  <th>本次工時</th>
                  <th>超出 12 小時時數</th>
                  <th>異常原因</th>
                </tr>
              </thead>
              <tbody>${detailRows || '<tr><td colspan="9">目前沒有疑似漏按暫停資料。</td></tr>'}</tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  function renderMachineUsageSection(view) {
    const container = document.getElementById("machineUsageSection");
    if (!container) {
      return;
    }

    if (!state.validRecords.length) {
      container.innerHTML = `<div class="empty-card">匯入資料後，這裡會自動建立動態機台主檔並分析各機台的加工工時占比、閒置狀態與未使用設備。</div>`;
      return;
    }

    const analysis = view.filteredMachineUsageAnalysis;
    const ranking = analysis.ranking || {};
    const machineUsageFormulaPanel = `
      <details class="formula-card" open>
        <summary>計算公式說明</summary>
        <div class="formula-card-body">
          <div class="formula-grid">
            <div class="formula-item">
              <strong>加工工時占比</strong>
              <p class="formula-expression">機台加工工時 ÷ 全廠加工工時 × 100%</p>
              <p>分子：該機台在本期間的總加工工時。</p>
              <p>分母：本期間所有機台總加工工時。</p>
              <p>用途：分析加工量集中在哪些機台，判斷哪些機台承擔最多加工量。</p>
            </div>
            <div class="formula-item">
              <strong>完全沒使用機台</strong>
              <p class="formula-expression">總加工工時 = 0 且查詢區間內無加工紀錄</p>
              <p>用途：分析設備閒置狀況。</p>
            </div>
            <div class="formula-item">
              <strong>閒置天數</strong>
              <p class="formula-expression">今天日期 - 最近加工日期</p>
              <p>用途：看哪些設備長期閒置。</p>
            </div>
          </div>
          <div class="table-shell nested-table-shell formula-table-shell">
            <table>
              <thead>
                <tr>
                  <th>指標名稱</th>
                  <th>公式</th>
                  <th>分子</th>
                  <th>分母</th>
                  <th>管理用途</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>加工工時占比</td>
                  <td class="mono">機台加工工時 ÷ 全廠加工工時</td>
                  <td>機台加工工時</td>
                  <td>全廠加工工時</td>
                  <td>看誰承擔最多加工量</td>
                </tr>
                <tr>
                  <td>機台利用率</td>
                  <td class="mono">機台加工工時 ÷ 機台可用工時</td>
                  <td>機台加工工時</td>
                  <td>機台可用工時</td>
                  <td>看誰最忙碌</td>
                </tr>
                <tr>
                  <td>閒置天數</td>
                  <td class="mono">今天 - 最近加工日</td>
                  <td>今日日期</td>
                  <td>最近加工日</td>
                  <td>看誰長期閒置</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="foot-note">完成製令單數：整張工單最後有有效 End。完成站數：該機台本站加工已完成，即使整張工單尚未全部完成也會計入。</div>
          <div class="foot-note">本區定位為加工工時占比分析與閒置設備分析，不稱為 OEE、設備稼動率或真實設備利用率。</div>
        </div>
      </details>
    `;
    const categoryCards = (analysis.categoryRows || [])
      .map(
        (item) => `
          <div class="detail-summary-item">
            <strong>${escapeHtml(item.category)}</strong>
            <span>機台 ${item.machineCount} 台｜本期間有資料 ${item.activeMachineCount} 台</span>
            <span>總加工 ${formatDuration(item.totalProcessingMs)}</span>
            <span>總等待 ${formatDuration(item.totalWaitingMs)}</span>
            <span>工時占比 ${formatPercentage(item.usageRate)}</span>
          </div>
        `
      )
      .join("");

    const highLoadRows = (analysis.highLoadRows || [])
      .map(
        (item) => `
          <tr>
            <td>${escapeHtml(item.machineId || "未填代號")}</td>
            <td>${escapeHtml(item.machineName || "未填機台名稱")}</td>
            <td class="mono">${formatDuration(item.totalProcessingMs)}</td>
            <td class="mono">${formatPercentage(item.usageRate)}</td>
            <td>${item.completedOrderCount} 張</td>
            <td>${item.completedStationCount} 站</td>
          </tr>
        `
      )
      .join("");

    const lowUsageRows = (analysis.lowUsageRows || [])
      .map(
        (item) => `
          <tr>
            <td>${escapeHtml(item.machineId || "未填代號")}</td>
            <td>${escapeHtml(item.machineName || "未填機台名稱")}</td>
            <td class="mono">${formatDuration(item.totalProcessingMs)}</td>
            <td class="mono">${formatPercentage(item.usageRate)}</td>
            <td>${item.completedOrderCount} 張</td>
            <td>${item.completedStationCount} 站</td>
          </tr>
        `
      )
      .join("");

    const unusedRows = (analysis.unusedRows || [])
      .map(
        (item) => `
          <tr>
            <td>${escapeHtml(item.machineId || "未填代號")}</td>
            <td>${escapeHtml(item.machineName || "未填機台名稱")}</td>
            <td>${escapeHtml(item.category || "其他設備")}</td>
            <td class="mono">0.0%</td>
            <td><span class="chip manual">未使用</span></td>
            <td class="mono">從未加工</td>
          </tr>
        `
      )
      .join("");

    const longestIdleRows = (analysis.longestIdleRows || [])
      .map(
        (item) => `
          <tr>
            <td>${escapeHtml(item.machineId || "未填代號")}</td>
            <td>${escapeHtml(item.machineName || "未填機台名稱")}</td>
            <td>${escapeHtml(item.category || "其他設備")}</td>
            <td class="mono">${item.idleDays == null ? "—" : `${item.idleDays} 天`}</td>
            <td class="mono">${formatDateTime(item.lastProcessedAt)}</td>
            <td>${item.status === "使用中" ? '<span class="chip complete">使用中</span>' : item.status === "閒置" ? '<span class="chip pending">閒置</span>' : '<span class="chip manual">未使用</span>'}</td>
          </tr>
        `
      )
      .join("");

    const machineKeyDiagnostics = buildMachineKeyDiagnostics(
      view.filteredWorkOrders,
      view.filteredMachineMetrics,
      analysis,
      ["D2", "D3"]
    );

    const diagnosticCards = machineKeyDiagnostics
      .map((machine) => {
        const detailRows = (machine.keyRows || [])
          .map(
            (item) => `
              <tr>
                <td class="mono">${escapeHtml(item.machineKey)}</td>
                <td>${escapeHtml(item.label || "未填機台")}</td>
                <td class="mono">${formatDuration(item.processingMs)}</td>
                <td>${item.workOrderCount} 張</td>
                <td>${item.segmentCount} 段</td>
              </tr>
            `
          )
          .join("");

        return `
          <div class="detail-panel-card">
            <div class="detail-panel-title">${escapeHtml(machine.machineId)} machineKey Debug</div>
            <div class="detail-summary-grid">
              <div class="detail-summary-item">
                <strong>工時占比分析合計</strong>
                <span>${formatDuration(machine.usageTotalProcessingMs)}</span>
              </div>
              <div class="detail-summary-item">
                <strong>各機台利用率 keys 合計</strong>
                <span>${formatDuration(machine.metricTotalProcessingMs)}</span>
              </div>
              <div class="detail-summary-item">
                <strong>是否一致</strong>
                <span>${machine.matchesUsageTotal ? "一致" : "不一致"}</span>
              </div>
            </div>
            <div class="table-shell nested-table-shell">
              <table>
                <thead>
                  <tr>
                    <th>machineKey</th>
                    <th>顯示名稱</th>
                    <th>加工工時</th>
                    <th>工單數</th>
                    <th>加工段數</th>
                  </tr>
                </thead>
                <tbody>${detailRows || '<tr><td colspan="5">目前沒有符合條件的資料。</td></tr>'}</tbody>
              </table>
            </div>
          </div>
        `;
      })
      .join("");

    const totalRows = (analysis.tableRows || [])
      .map(
        (item) => `
          <tr>
            <td class="mono">${escapeHtml(item.machineId || "未填代號")}</td>
            <td>${escapeHtml(item.machineName || "未填機台名稱")}</td>
            <td>${escapeHtml(item.category || "其他設備")}</td>
            <td class="mono">${formatDuration(item.totalProcessingMs)}</td>
            <td class="mono">${formatDuration(item.totalWaitingMs)}</td>
            <td class="mono">${formatPercentage(item.usageRate)}</td>
            <td>${item.completedOrderCount} 張</td>
            <td>${item.completedStationCount} 站</td>
            <td class="mono">${formatDuration(item.averageProcessingMs)}</td>
            <td class="mono">${formatDuration(item.averageWaitingMs)}</td>
            <td>${item.segmentCount} 段</td>
            <td class="mono">${formatDateTime(item.lastProcessedAt)}</td>
            <td>${item.status === "使用中" ? '<span class="chip complete">使用中</span>' : item.status === "閒置" ? '<span class="chip pending">閒置</span>' : '<span class="chip manual">未使用</span>'}</td>
          </tr>
        `
      )
      .join("");

    container.innerHTML = `
      ${machineUsageFormulaPanel}
      <div class="detail-summary-grid">
        <div class="detail-summary-item">
          <strong>動態機台主檔</strong>
          <span>主檔共 ${analysis.masterCount} 台</span>
          <span>本期間有資料 ${analysis.activeCount} 台</span>
        </div>
        <div class="detail-summary-item">
          <strong>工時占比最高機台</strong>
          <span>${escapeHtml(ranking.highestUsage ? ranking.highestUsage.label : "目前沒有資料")}</span>
          <span>${formatPercentage(ranking.highestUsage ? ranking.highestUsage.usageRate : 0)}</span>
        </div>
        <div class="detail-summary-item">
          <strong>工時占比最低機台</strong>
          <span>${escapeHtml(ranking.lowestUsage ? ranking.lowestUsage.label : "目前沒有資料")}</span>
          <span>${formatPercentage(ranking.lowestUsage ? ranking.lowestUsage.usageRate : 0)}</span>
        </div>
        <div class="detail-summary-item">
          <strong>最忙碌機台</strong>
          <span>${escapeHtml(ranking.busiest ? ranking.busiest.label : "目前沒有資料")}</span>
          <span>${formatDuration(ranking.busiest ? ranking.busiest.totalProcessingMs : 0)}</span>
        </div>
        <div class="detail-summary-item">
          <strong>最閒置機台</strong>
          <span>${escapeHtml(ranking.idlest ? ranking.idlest.label : "目前沒有資料")}</span>
          <span>${ranking.idlest && ranking.idlest.idleDays != null ? `${ranking.idlest.idleDays} 天未加工` : "目前沒有資料"}</span>
        </div>
        <div class="detail-summary-item">
          <strong>最久未使用機台</strong>
          <span>${escapeHtml(ranking.longestUnused ? ranking.longestUnused.label : "目前沒有資料")}</span>
          <span>${ranking.longestUnused && ranking.longestUnused.idleDays != null ? `${ranking.longestUnused.idleDays} 天` : "從未加工或沒有資料"}</span>
        </div>
        <div class="detail-summary-item">
          <strong>本期間總加工工時</strong>
          <span>${formatDuration(analysis.totalProcessingMs || 0)}</span>
          <span>加工工時占比以本期間加工工時占比計算</span>
        </div>
      </div>
      <div class="analytics-grid">
        ${renderBarCard(
          "加工工時占比排行",
          (analysis.usageRankRows || []).map((item) => ({ label: item.label, value: item.usageRate })),
          "percent"
        )}
        ${renderBarCard(
          "機台加工工時排行",
          (analysis.highLoadRows || []).slice(0, 10).map((item) => ({ label: item.label, value: item.totalProcessingMs })),
          "duration"
        )}
      </div>
      <div class="detail-panel-grid analytics-detail-grid">
        <div class="detail-panel-card detail-panel-wide">
          <div class="detail-panel-title">機台分類分析</div>
          <div class="detail-summary-grid">${categoryCards || '<div class="empty-card compact-empty">目前沒有機台分類資料。</div>'}</div>
        </div>
        <div class="detail-panel-card">
          <div class="detail-panel-title">高負載機台</div>
          <div class="table-shell nested-table-shell">
            <table>
              <thead>
                <tr>
                  <th>機台代號</th>
                  <th>機台名稱</th>
                  <th>總加工工時</th>
                  <th>加工工時占比</th>
                  <th>完成製令單數</th>
                  <th>完成站數</th>
                </tr>
              </thead>
              <tbody>${highLoadRows || '<tr><td colspan="6">目前沒有高負載機台資料。</td></tr>'}</tbody>
            </table>
          </div>
        </div>
        <div class="detail-panel-card">
          <div class="detail-panel-title">低使用率機台</div>
          <div class="table-shell nested-table-shell">
            <table>
              <thead>
                <tr>
                  <th>機台代號</th>
                  <th>機台名稱</th>
                  <th>總加工工時</th>
                  <th>加工工時占比</th>
                  <th>完成製令單數</th>
                  <th>完成站數</th>
                </tr>
              </thead>
              <tbody>${lowUsageRows || '<tr><td colspan="6">目前沒有低使用率機台資料。</td></tr>'}</tbody>
            </table>
          </div>
        </div>
        <div class="detail-panel-card">
          <div class="detail-panel-title">完全沒使用機台</div>
          <div class="table-shell nested-table-shell">
            <table>
              <thead>
                <tr>
                  <th>機台代號</th>
                  <th>機台名稱</th>
                  <th>機台分類</th>
                  <th>加工工時占比</th>
                  <th>狀態</th>
                  <th>最近未加工時間</th>
                </tr>
              </thead>
              <tbody>${unusedRows || '<tr><td colspan="6">目前沒有完全未使用機台。</td></tr>'}</tbody>
            </table>
          </div>
        </div>
        <div class="detail-panel-card">
          <div class="detail-panel-title">閒置天數最高機台</div>
          <div class="table-shell nested-table-shell">
            <table>
              <thead>
                <tr>
                  <th>機台代號</th>
                  <th>機台名稱</th>
                  <th>機台分類</th>
                  <th>閒置天數</th>
                  <th>最近加工時間</th>
                  <th>狀態</th>
                </tr>
              </thead>
              <tbody>${longestIdleRows || '<tr><td colspan="6">目前沒有閒置機台資料。</td></tr>'}</tbody>
            </table>
          </div>
        </div>
        <div class="detail-panel-card detail-panel-wide">
          <div class="detail-panel-title">加工工時占比總表</div>
          <div class="foot-note">此處會保留固定機台主檔中的所有設備。即使本期間完全沒有加工資料，也會顯示 0% 並標記未使用。</div>
          <div class="table-shell nested-table-shell">
            <table>
              <thead>
                <tr>
                  <th>機台代號</th>
                  <th>機台名稱</th>
                  <th>機台分類</th>
                  <th>總加工工時</th>
                  <th>總等待工時</th>
                  <th>加工工時占比</th>
                  <th>完成製令單數</th>
                  <th>完成站數</th>
                  <th>平均加工工時</th>
                  <th>平均等待工時</th>
                  <th>加工段數</th>
                  <th>最近加工時間</th>
                  <th>狀態</th>
                </tr>
              </thead>
              <tbody>${totalRows || '<tr><td colspan="13">目前沒有機台使用率資料。</td></tr>'}</tbody>
            </table>
          </div>
        </div>
        <div class="detail-panel-card detail-panel-wide">
          <div class="detail-panel-title">D2 / D3 機台鍵值 Debug</div>
          <div class="foot-note">這個區塊只用來比對目前各機台利用率的 machineKey 拆分情況，確認 D2 / D3 是否因機台名稱差異被拆成多筆。</div>
          <div class="detail-panel-grid analytics-detail-grid">${diagnosticCards || '<div class="empty-card compact-empty">目前沒有 D2 / D3 的 debug 資料。</div>'}</div>
        </div>
      </div>
    `;
  }

  function renderComparisonSection(view) {
    const container = document.getElementById("comparisonSection");
    if (!state.validRecords.length) {
      container.innerHTML = `<div class="empty-card">同品名規格工時比較會在匯入資料後自動產生。</div>`;
      return;
    }

    if (!view.filteredComparisons.length) {
      container.innerHTML = `<div class="empty-card">目前沒有同一品名規格出現 2 張以上製令單的資料。</div>`;
      return;
    }

    const cards = view.filteredComparisons
      .map(
        (group) => `
          <details class="comparison-card panel-soft-card">
            <summary>
              <div>
                <strong>${escapeHtml(group.productSpec)}</strong>
                <div class="foot-note">製令單筆數：${group.orderCount}｜已完成：${group.completedCount}｜有效樣本：${group.includeCount}｜累計生產數量：${escapeHtml(group.totalQuantityText)}</div>
              </div>
              <div class="comparison-summary-grid">
                <span>平均加工 ${formatDuration(group.avgProcessingMs)}</span>
                <span>平均等待 ${formatDuration(group.avgWaitingMs)}</span>
                <span>平均 Lead Time ${formatDuration(group.avgLeadTimeMs)}</span>
                <span>平均總時間 ${formatDuration(group.avgAllowanceMs)}</span>
              </div>
            </summary>
            <div class="table-shell nested-table-shell">
              <table>
                <thead>
                  <tr>
                    <th>製令單號（數量）</th>
                    <th>總加工工時</th>
                    <th>總等待工時</th>
                    <th>Lead Time</th>
                    <th>總時間含寬放1.3</th>
                    <th>是否完成</th>
                    <th>是否納入標準工時</th>
                  </tr>
                </thead>
                <tbody>
                  ${group.orders
                    .map(
                      (order) => {
                        const operatorRows = calculateWorkOrderOperatorAnalysis(order)
                          .map(
                            (item) => `
                              <tr>
                                <td><button class="link-button" type="button" data-operator-link="${escapeHtml(item.operator)}">${escapeHtml(item.operator)}</button></td>
                                <td class="mono">${formatDuration(item.totalProcessingMs)}</td>
                                <td>${item.segmentCount} 次</td>
                                <td class="mono">${formatDuration(item.averageProcessingMs)}</td>
                                <td>${escapeHtml(item.machineList.join("、"))}</td>
                                <td>${item.validWorkTime ? '<span class="chip complete">是</span>' : '<span class="chip manual">不納入計算</span>'}</td>
                                <td>${item.hasAnomaly ? '<span class="chip anomaly">是</span>' : '<span class="chip complete">否</span>'}</td>
                              </tr>
                              <tr>
                                <td colspan="7" class="foot-note">${escapeHtml(item.noteText)}</td>
                              </tr>
                            `
                          )
                          .join("");

                        const operatorAnalysisBlock = `
                          <details class="inline-details comparison-inline-details">
                            <summary class="link-summary"><span class="mono primary-text">${escapeHtml(formatWorkOrderWithQuantity(order.workOrderNo, order.quantity, order.unit))}</span></summary>
                            <div class="foot-note">加工人員分析。點擊人員名稱可查看人員詳細頁。</div>
                            <div class="table-shell nested-table-shell">
                              <table>
                                <thead>
                                  <tr>
                                    <th>人員名稱</th>
                                    <th>加工工時</th>
                                    <th>加工次數</th>
                                    <th>平均工時</th>
                                    <th>使用機台</th>
                                    <th>是否有效工時</th>
                                    <th>是否異常資料</th>
                                  </tr>
                                </thead>
                                <tbody>${operatorRows || '<tr><td colspan="7">目前沒有可顯示的人員加工分析。</td></tr>'}</tbody>
                              </table>
                            </div>
                          </details>
                        `;

                        return `
                        <tr>
                          <td>${operatorAnalysisBlock}</td>
                          <td class="mono">${formatDuration(order.totalProcessingMs)}</td>
                          <td class="mono">${formatDuration(order.totalWaitingMs)}</td>
                          <td class="mono">${formatDuration(order.leadTimeMs)}</td>
                          <td class="mono">${formatDuration(order.totalTimeWithAllowance)}</td>
                          <td>${order.completed ? '<span class="chip complete">已完成</span>' : '<span class="chip pending">未完成</span>'}</td>
                          <td>${order.includeInAverage ? '<span class="chip complete">是</span>' : '<span class="chip manual">否</span>'}</td>
                        </tr>
                      `;
                      }
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
          </details>
        `
      )
      .join("");

    container.innerHTML = cards;
  }

  function renderProductFlowAnalysisSection(view) {
    const container = document.getElementById("productFlowAnalysisSection");
    const note = document.getElementById("productFlowAnalysisNote");
    if (!container || !note) {
      return;
    }

    if (!state.validRecords.length) {
      note.textContent = "";
      container.innerHTML = `<div class="empty-card">尚未載入資料。匯入 MES 工時資料後，這裡會依品名規格自動建立歷史流程分析表。</div>`;
      return;
    }

    const groups = view.filteredProductFlowAnalysis || [];
    const keyword = cleanString(state.productFlowSearchTerm);
    const sampleCount = groups.reduce((sum, group) => sum + group.analysisSampleCount, 0);
    note.textContent = `目前顯示 ${groups.length} 組品名規格流程｜分析樣本 ${sampleCount} 筆${keyword ? `｜搜尋：${keyword}` : ""}`;

    if (!groups.length) {
      container.innerHTML = `<div class="empty-card">目前條件下沒有可分析的品名規格流程資料。</div>`;
      return;
    }

    container.innerHTML = groups
      .map((group) => {
        const routeTables = (group.routeGroups || [])
          .map((routeGroup) => {
            const tableModel = buildProductFlowRouteTableModel(routeGroup);

            const headerCells = tableModel.headerColumns
              .slice(1, -4)
              .map((column) =>
                column.type === "machine"
                  ? `<th class="flow-dynamic-col">${escapeHtml(column.headerLabel)}</th>`
                  : `<th class="flow-wait-col">${escapeHtml(column.headerLabel)}</th>`
              )
              .join("");

            const bodyRows = tableModel.bodyRows
              .map((row) => {
                const dynamicCells = row
                  .slice(1, -4)
                  .map((value) => `<td class="mono">${escapeHtml(value)}</td>`)
                  .join("");

                return `
                  <tr>
                    <td class="mono primary-text">${escapeHtml(row[0])}</td>
                    ${dynamicCells}
                    <td class="mono">${escapeHtml(row[row.length - 4])}</td>
                    <td class="mono">${escapeHtml(row[row.length - 3])}</td>
                    <td class="mono">${escapeHtml(row[row.length - 2])}</td>
                    <td class="mono">${escapeHtml(row[row.length - 1])}</td>
                  </tr>
                `;
              })
              .join("");
            const footerRows = tableModel.footerRows
              .map((footerRow) => {
                const dynamicCells = footerRow.cells
                  .slice(1, -4)
                  .map((value) =>
                    value === "—" ? `<td class="flow-table-muted">—</td>` : `<td class="mono">${escapeHtml(value)}</td>`
                  )
                  .join("");
                const totalWork = footerRow.cells[footerRow.cells.length - 4];
                const unitWork = footerRow.cells[footerRow.cells.length - 3];
                const totalWaiting = footerRow.cells[footerRow.cells.length - 2];
                const totalAllowance = footerRow.cells[footerRow.cells.length - 1];

                return `
                  <tr class="product-flow-footer-row">
                    <td class="product-flow-footer-title">${escapeHtml(footerRow.label)}</td>
                    ${dynamicCells}
                    ${totalWork === "—" ? `<td class="flow-table-muted">—</td>` : `<td class="mono">${escapeHtml(totalWork)}</td>`}
                    ${unitWork === "—" ? `<td class="flow-table-muted">—</td>` : `<td class="mono">${escapeHtml(unitWork)}</td>`}
                    ${totalWaiting === "—" ? `<td class="flow-table-muted">—</td>` : `<td class="mono">${escapeHtml(totalWaiting)}</td>`}
                    ${totalAllowance === "—" ? `<td class="flow-table-muted">—</td>` : `<td class="mono">${escapeHtml(totalAllowance)}</td>`}
                  </tr>
                `;
              })
              .join("");

            return `
              <div class="product-flow-route-card">
                <div class="product-flow-route-title">${escapeHtml(routeGroup.routeLabel)}</div>
                <div class="foot-note">流程製令單筆數 ${routeGroup.orderCount} 筆｜分析樣本數 ${routeGroup.analysisSampleCount} 筆</div>
                <div class="table-shell nested-table-shell product-flow-table-shell">
                  <table>
                    <thead>
                      <tr>
                        <th>製令單號（數量）</th>
                        ${headerCells}
                        <th>總工時</th>
                        <th>單件工時</th>
                        <th>總等待時間</th>
                        <th>總時間(含寬放1.3)</th>
                      </tr>
                    </thead>
                    <tbody>${bodyRows}</tbody>
                    <tfoot>${footerRows}</tfoot>
                  </table>
                </div>
              </div>
            `;
          })
          .join("");

        return `
          <details class="comparison-card panel-soft-card">
            <summary>
              <div>
                <strong>${escapeHtml(group.productSpec)}</strong>
                <div class="foot-note">製令單筆數：${group.orderCount} 筆 ｜ 分析樣本數：${group.analysisSampleCount} 筆 ｜ 累計生產數量：${escapeHtml(group.totalQuantityText)}</div>
              </div>
              <div class="comparison-summary-grid">
                <span>平均總工時 ${formatDuration(group.averageTotalProcessingMs)}</span>
                <span>平均等待 ${formatDuration(group.averageTotalWaitingMs)}</span>
                <span>平均 Lead Time ${formatDuration(group.averageLeadTimeMs)}</span>
                <span>平均總時間 ${formatDuration(group.averageAllowanceMs)}</span>
                <span>平均單件工時 ${formatOptionalDuration(group.averageUnitProcessingMs)}</span>
              </div>
            </summary>
            <div class="detail-summary-grid product-flow-group-summary">
              <div class="detail-summary-item">
                <strong>平均總工時</strong>
                <span>${formatDuration(group.averageTotalProcessingMs)}</span>
              </div>
              <div class="detail-summary-item">
                <strong>平均等待時間</strong>
                <span>${formatDuration(group.averageTotalWaitingMs)}</span>
              </div>
              <div class="detail-summary-item">
                <strong>平均 Lead Time</strong>
                <span>${formatDuration(group.averageLeadTimeMs)}</span>
              </div>
              <div class="detail-summary-item">
                <strong>平均總時間(含寬放1.3)</strong>
                <span>${formatDuration(group.averageAllowanceMs)}</span>
              </div>
              <div class="detail-summary-item">
                <strong>平均單件工時</strong>
                <span>${formatOptionalDuration(group.averageUnitProcessingMs)}</span>
              </div>
            </div>
            <div class="product-flow-route-stack">${routeTables}</div>
          </details>
        `;
      })
      .join("");
  }

  function renderProductOperatorSection(view) {
    const container = document.getElementById("productOperatorSection");
    if (!state.validRecords.length) {
      container.innerHTML = `<div class="empty-card">匯入資料後，這裡會依品名規格整理各人加工分析。</div>`;
      return;
    }

    if (!view.filteredProductOperatorGroups.length) {
      container.innerHTML = `<div class="empty-card">目前篩選條件下沒有可顯示的品名規格 × 人員分析。</div>`;
      return;
    }

    const cards = view.filteredProductOperatorGroups
      .map(
        (group) => `
          <details class="comparison-card panel-soft-card">
            <summary>
              <div>
                <strong>${escapeHtml(group.productSpec)}</strong>
                <div class="foot-note">標準化品名：${escapeHtml(group.normalizedProductSpec)}｜製令單 ${group.orderCount} 張</div>
              </div>
              <div class="comparison-summary-grid">
                <span>人員 ${group.operators.length} 位</span>
                <span>原始寫法 ${group.originalSpecs.length} 種</span>
              </div>
            </summary>
            <div class="foot-note">原始品名規格：${escapeHtml(group.originalSpecs.join("、") || group.productSpec)}</div>
            <div class="table-shell nested-table-shell">
              <table>
                <thead>
                  <tr>
                    <th>人員名稱</th>
                    <th>各人加工工時</th>
                    <th>各人加工次數</th>
                    <th>各人平均工時</th>
                    <th>使用機台</th>
                    <th>製令單數</th>
                    <th>提醒</th>
                  </tr>
                </thead>
                <tbody>
                  ${group.operators
                    .map(
                      (item) => `
                        <tr>
                          <td><button class="link-button" type="button" data-operator-link="${escapeHtml(item.operator)}">${escapeHtml(item.operator)}</button></td>
                          <td class="mono">${formatDuration(item.totalProcessingMs)}</td>
                          <td>${item.segmentCount} 次</td>
                          <td class="mono">${formatDuration(item.averageProcessingMs)}</td>
                          <td>${escapeHtml(item.machineList.join("、"))}</td>
                          <td>${item.workOrderCount} 張</td>
                          <td>${item.warningCount ? '<span class="chip pending">⚠ 疑似漏按暫停</span>' : '<span class="chip complete">正常</span>'}</td>
                        </tr>
                      `
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
          </details>
        `
      )
      .join("");

    container.innerHTML = cards;
  }

  function renderOperatorSummarySection(view) {
    const container = document.getElementById("operatorSummarySection");
    if (!state.validRecords.length) {
      container.innerHTML = `<div class="empty-card">匯入資料後，這裡會整理每位人員的加工分析。</div>`;
      return;
    }

    if (!view.filteredOperatorSummaries.length) {
      container.innerHTML = `<div class="empty-card">目前篩選條件下沒有可顯示的人員加工資料。</div>`;
      return;
    }

    container.innerHTML = `
      <div class="table-shell nested-table-shell">
        <table>
          <thead>
                <tr>
                  <th>人員名稱</th>
                  <th>所有製令單</th>
                  <th>加工總工時</th>
                  <th>平均工時</th>
                  <th>加工次數</th>
                  <th>使用機台</th>
                  <th>加工過的品名規格</th>
                  <th>最近加工紀錄</th>
                  <th>提醒</th>
                </tr>
              </thead>
              <tbody>
                ${view.filteredOperatorSummaries
              .map(
                (item) => `
                  <tr>
                    <td><button class="link-button" type="button" data-operator-link="${escapeHtml(item.operator)}">${escapeHtml(item.operator)}</button></td>
                    <td>${item.workOrderCount} 張</td>
                    <td class="mono">${formatDuration(item.totalProcessingMs)}</td>
                    <td class="mono">${formatDuration(item.averageProcessingMs)}</td>
                    <td>${item.segmentCount} 次</td>
                    <td>${escapeHtml(item.machineList.join("、"))}</td>
                    <td>${escapeHtml(item.productSpecs.slice(0, 3).join("、"))}${item.productSpecs.length > 3 ? ` 等 ${item.productSpecs.length} 項` : ""}</td>
                    <td class="mono">${formatDateTime(item.latestRecordAt)}</td>
                    <td>${item.warningCount ? `<span class="chip pending">⚠ ${item.warningCount} 次</span>` : '<span class="chip complete">正常</span>'}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderOperatorDetailSection(view) {
    const container = document.getElementById("operatorDetailSection");
    if (!state.validRecords.length) {
      container.innerHTML = `<div class="empty-card">匯入資料後，點擊人員名稱即可查看詳細頁。</div>`;
      return;
    }

    const detail = view.selectedOperatorSummary;
    if (!detail) {
      container.innerHTML = `<div class="empty-card">請先點擊上方的人員名稱，即可查看該人員所有加工紀錄與工時統計。</div>`;
      return;
    }

    const recordRows = detail.records
      .map(
        (record, index) => `
          <tr>
            <td>${index + 1}</td>
            <td class="mono primary-text">${escapeHtml(record.workOrderNo)}</td>
            <td>${escapeHtml(record.productSpec)}</td>
            <td>${escapeHtml(record.machineName)}</td>
            <td class="mono">${formatDateTime(record.startAt)}</td>
            <td class="mono">${formatDateTime(record.endAt)}</td>
            <td class="mono">${formatDuration(record.processingMs)}</td>
            <td>${escapeHtml(record.statusLabel)}${record.missedPauseWarning ? "｜⚠ 疑似漏按暫停" : ""}</td>
          </tr>
        `
      )
      .join("");

    container.innerHTML = `
      <div class="detail-panel-grid">
        <div class="detail-panel-card">
          <div class="detail-panel-title">${escapeHtml(detail.operator)}</div>
          <div class="detail-summary-grid">
            <div class="detail-summary-item"><strong>所有製令單</strong><span>${detail.workOrderCount} 張</span></div>
            <div class="detail-summary-item"><strong>加工總工時</strong><span>${formatDuration(detail.totalProcessingMs)}</span></div>
            <div class="detail-summary-item"><strong>平均工時</strong><span>${formatDuration(detail.averageProcessingMs)}</span></div>
            <div class="detail-summary-item"><strong>使用機台</strong><span>${detail.machineCount} 台</span></div>
            <div class="detail-summary-item"><strong>加工過的品名規格</strong><span>${detail.productSpecs.length} 項</span></div>
            <div class="detail-summary-item"><strong>最近加工紀錄</strong><span>${formatDateTime(detail.latestRecordAt)}</span></div>
            <div class="detail-summary-item"><strong>疑似漏按暫停</strong><span>${detail.warningCount || 0} 次</span></div>
          </div>
          <div class="foot-note">使用機台：${escapeHtml(detail.machineList.join("、"))}</div>
          <div class="foot-note">加工過的品名規格：${escapeHtml(detail.productSpecs.join("、"))}</div>
        </div>
        <div class="detail-panel-card detail-panel-wide">
          <div class="detail-panel-title">該人員所有加工紀錄</div>
          <div class="table-shell nested-table-shell">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>製令單號</th>
                  <th>品名規格</th>
                  <th>機台</th>
                  <th>開始時間</th>
                  <th>結束時間</th>
                  <th>加工工時</th>
                  <th>工單狀態</th>
                </tr>
              </thead>
              <tbody>${recordRows}</tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  function groupByPartNo(order) {
    return cleanString(order.requiredItem) || cleanString(order.parentItemNo) || getProductGroupKey(order) || cleanString(order.productSpec);
  }

  function calculatePartSummary(workOrders) {
    const groups = new Map();

    (workOrders || [])
      .filter((order) => isEligibleAverageOrder(order) && normalizeDuration(order.totalProcessingMs) > 0)
      .forEach((order) => {
        const key = groupByPartNo(order);
        if (!key) {
          return;
        }
        if (!groups.has(key)) {
          groups.set(key, {
            partNo: order.productGroupKey && !order.requiredItem && !order.parentItemNo ? order.productSpec : key,
            productSpec: order.productSpec || order.normalizedProductSpec || key,
            totalQuantity: 0,
            occurrenceCount: 0,
            totalProcessingMs: 0,
            totalWaitingMs: 0,
            minProcessingMs: Number.POSITIVE_INFINITY,
            maxProcessingMs: 0,
            leadTimes: [],
            machineSet: new Set(),
          });
        }
        const target = groups.get(key);
        target.occurrenceCount += 1;
        target.totalProcessingMs += normalizeDuration(order.totalProcessingMs);
        target.totalWaitingMs += normalizeDuration(order.totalWaitingMs);
        target.minProcessingMs = Math.min(target.minProcessingMs, normalizeDuration(order.totalProcessingMs));
        target.maxProcessingMs = Math.max(target.maxProcessingMs, normalizeDuration(order.totalProcessingMs));
        target.leadTimes.push(normalizeDuration(order.leadTimeMs));
        const quantity = typeof order.quantity === "number" ? order.quantity : Number(order.quantity || 0);
        target.totalQuantity += Number.isFinite(quantity) ? quantity : 0;
        (order.machineRoute || []).forEach((machine) => {
          if (machine) {
            target.machineSet.add(machine);
          }
        });
      });

    return Array.from(groups.values())
      .map((item) => ({
        partNo: item.partNo,
        productSpec: item.productSpec,
        totalQuantity: item.totalQuantity,
        occurrenceCount: item.occurrenceCount,
        totalProcessingMs: item.totalProcessingMs,
        totalWaitingMs: item.totalWaitingMs,
        averageProcessingMs: item.occurrenceCount ? Math.round(item.totalProcessingMs / item.occurrenceCount) : 0,
        averageWaitingMs: item.occurrenceCount ? Math.round(item.totalWaitingMs / item.occurrenceCount) : 0,
        minProcessingMs: Number.isFinite(item.minProcessingMs) ? item.minProcessingMs : 0,
        maxProcessingMs: item.maxProcessingMs,
        machineCount: item.machineSet.size,
        machineList: Array.from(item.machineSet).join("、"),
        averageLeadTimeMs: item.leadTimes.length ? average(item.leadTimes) : 0,
      }))
      .sort((a, b) => b.totalProcessingMs - a.totalProcessingMs || a.partNo.localeCompare(b.partNo));
  }

  async function exportRangeReport(mode) {
    if (!state.validRecords.length) {
      setMessage("目前沒有可匯出的資料。", "error");
      return;
    }

    try {
      const range = resolveExportRange(mode);
      const scoped = getScopedData(range);
      const workbook = createExcelWorkbook();
      const sheets = buildAnalysisSheets(scoped);

      appendSheet(workbook, "製令單彙總", sheets.workOrderSheet);
      appendSheet(workbook, "各機台工時明細", sheets.machineDetailSheet);
      if (state.partSummaryEnabled) {
        appendSheet(workbook, "料件彙總分析", sheets.partSummarySheet);
      }
      appendSheet(workbook, "品名規格流程分析", sheets.productFlowDetailSheet);
      appendSheet(workbook, "品名規格流程統計", sheets.productFlowSummarySheet);
      appendSheet(workbook, "站間等待分析", sheets.waitingSheet);
      appendSheet(workbook, "機台利用率", sheets.machineUtilSheet);
      appendSheet(workbook, "疑似漏按暫停", sheets.missedPauseSheet);
      appendSheet(workbook, "異常資料", sheets.anomalySheet);
      appendSheet(workbook, "原始資料", sheets.rawSheet);

      const fileName = `MES分析報表_${buildRangeFileLabel(range)}.xlsx`;
      await saveExcelWorkbook(workbook, fileName);
      setMessage(`已匯出：${fileName}`, "info");
    } catch (error) {
      setMessage(error.message || "Excel 匯出失敗。", "error");
    }
  }

  async function exportRawReportingReport() {
    if (!state.rawRows.length) {
      setMessage("目前沒有可匯出的原始報工紀錄。", "error");
      return;
    }
    try {
      const workbook = createExcelWorkbook();
      appendSheet(workbook, "原始報工紀錄", buildRawReportingSheet(state.rawRows));
      const fileName = "MES原始報工紀錄.xlsx";
      await saveExcelWorkbook(workbook, fileName);
      setMessage(`已匯出全部 ${state.rawRows.length} 筆原始報工紀錄：${fileName}`, "info");
    } catch (error) {
      setMessage(error.message || "原始報工紀錄匯出失敗。", "error");
    }
  }

  async function exportAllAnalysisReport() {
    if (!state.rawRows.length) {
      setMessage("目前沒有可匯出的完整分析資料。", "error");
      return;
    }

    try {
      const scoped = getScopedData();
      const workbook = createExcelWorkbook();
      const sheets = buildAnalysisSheets(scoped);

      appendSheet(workbook, "製令單彙總", sheets.workOrderSheet);
      appendSheet(workbook, "各機台工時明細", sheets.machineDetailSheet);
      if (state.partSummaryEnabled) {
        appendSheet(workbook, "料件彙總分析", sheets.partSummarySheet);
      }
      appendSheet(workbook, "品名規格流程分析", sheets.productFlowDetailSheet);
      appendSheet(workbook, "品名規格流程統計", sheets.productFlowSummarySheet);
      appendSheet(workbook, "站間等待分析", sheets.waitingSheet);
      appendSheet(workbook, "機台利用率", sheets.machineUtilSheet);
      appendSheet(workbook, "疑似漏按暫停", sheets.missedPauseSheet);
      appendSheet(workbook, "異常資料", sheets.anomalySheet);
      appendSheet(workbook, "原始資料", sheets.rawSheet);

      appendSheet(workbook, "原始報工紀錄", buildRawReportingSheet(state.rawRows));

      const fileName = `MES全部分析報表_${buildRangeFileLabel(scoped.range)}.xlsx`;
      await saveExcelWorkbook(workbook, fileName);
      setMessage(`已匯出：${fileName}`, "info");
    } catch (error) {
      setMessage(error.message || "完整分析報表匯出失敗。", "error");
    }
  }

  async function exportYearlyArchiveReport(year) {
    const selectedYear = cleanString(year || state.selectedArchiveYear);
    const archiveData = state.archiveData || {};
    const archiveOrders = selectedYear && archiveData.archivedOrdersByYear ? archiveData.archivedOrdersByYear[selectedYear] || [] : [];
    const archiveRecords = selectedYear && archiveData.archivedByYear ? archiveData.archivedByYear[selectedYear] || [] : [];

    if (!selectedYear) {
      setMessage("請先選擇要匯出的年度。", "error");
      return;
    }

    if (!archiveOrders.length) {
      setMessage(`目前沒有 ${selectedYear} 年度可匯出的歷史資料。`, "error");
      return;
    }

    try {
      const workbook = createExcelWorkbook();
      const summaryRow = (archiveData.archiveSummary || []).find((item) => String(item.year) === selectedYear);
      const overviewSheet = [
        {
          年度: `${selectedYear}年度`,
          已結案製令單數: summaryRow ? summaryRow.workOrderCount : archiveOrders.length,
          資料筆數: summaryRow ? summaryRow.recordCount : archiveRecords.length,
          總加工工時: formatDuration((summaryRow && summaryRow.totalProcessingMs) || archiveOrders.reduce((sum, item) => sum + normalizeDuration(item.totalProcessingMs), 0)),
          總等待工時: formatDuration((summaryRow && summaryRow.totalWaitingMs) || archiveOrders.reduce((sum, item) => sum + normalizeDuration(item.totalWaitingMs), 0)),
          平均LeadTime: formatDuration((summaryRow && summaryRow.averageLeadTimeMs) || average(archiveOrders.map((item) => normalizeDuration(item.leadTimeMs)))),
        },
      ];

      const detailSheet = archiveOrders.map((order) => ({
        製令單號: order.workOrderNo,
        品名規格: order.productSpec || "",
        數量: displayValue(order.quantity),
        機台流程: (order.machineRoute || []).join(" → "),
        總加工工時: formatDuration(order.totalProcessingMs),
        總等待工時: formatDuration(order.totalWaitingMs),
        LeadTime: formatDuration(order.leadTimeMs),
        最後完成時間: formatDateTime(order.archiveEndedAt || order.finishedAt),
        狀態: order.statusLabel || "已結案",
      }));

      const machineYearMap = new Map();
      archiveOrders.forEach((order) => {
        (order.machineWorkSummary || []).forEach((machine) => {
          const key = machine.machineKey || getMachineKey(machine.machineId, machine.machineName) || machine.stationName;
          if (!machineYearMap.has(key)) {
            machineYearMap.set(key, {
              machine: machine.stationName,
              processingMs: 0,
              waitingMs: 0,
              usageCount: 0,
            });
          }
          const target = machineYearMap.get(key);
          target.processingMs += normalizeDuration(machine.processingHours);
          target.waitingMs += normalizeDuration(machine.waitingHours);
          target.usageCount += normalizeDuration(machine.processingHours) > 0 ? 1 : 0;
        });
      });

      const machineYearSheet = Array.from(machineYearMap.values())
        .sort((a, b) => b.processingMs - a.processingMs || a.machine.localeCompare(b.machine, "zh-Hant"))
        .map((item) => ({
          機台: item.machine,
          加工工時: formatDuration(item.processingMs),
          等待工時: formatDuration(item.waitingMs),
          使用次數: item.usageCount,
        }));

      appendSheet(workbook, "年度歸檔總覽", overviewSheet);
      appendSheet(workbook, "年度製令單明細", detailSheet);
      appendSheet(workbook, "年度機台統計", machineYearSheet);
      const archivedOrderNumbers = new Set(archiveOrders.map((order) => order.workOrderNo));
      appendSheet(workbook, "年度原始報工紀錄", buildRawReportingSheet(state.rawRows, archivedOrderNumbers));

      const fileName = `MES年度歸檔_${selectedYear}.xlsx`;
      await saveExcelWorkbook(workbook, fileName);
      setMessage(`已匯出：${fileName}`, "info");
    } catch (error) {
      setMessage(error.message || "年度歷史資料匯出失敗。", "error");
    }
  }

  function buildRawReportingSheet(rawRows, workOrderNumbers = null) {
    const columns = [
      ["使用者", "operator"],
      ["設備編號", "machineId"],
      ["設備名稱", "machineName"],
      ["製令單號", "workOrderNo"],
      ["母件編號", "parentItemNo"],
      ["需求料件", "requiredItem"],
      ["品名規格", "productSpec"],
      ["生產數量", "quantity"],
      ["動作狀態", "actionStatus"],
      ["紀錄時間", "recordedAt"],
    ];
    const requiredFields = new Set(columns.map(([, field]) => field));
    const headerFields = new Map();
    const extraHeaders = new Set();
    const includedRows = [];

    (rawRows || []).forEach((row) => {
      const fields = new Map();
      Object.keys(row || {}).forEach((header) => {
        if (!headerFields.has(header)) {
          headerFields.set(header, findMappedField(normalizeHeader(header)));
        }
        const field = headerFields.get(header);
        if (field) {
          fields.set(field, row[header]);
        }
      });

      // Select archives by order, not event year, so cross-year and invalid events survive.
      if (workOrderNumbers && !workOrderNumbers.has(cleanString(fields.get("workOrderNo")))) {
        return;
      }
      Object.keys(row || {}).forEach((header) => {
        if (!requiredFields.has(headerFields.get(header))) {
          extraHeaders.add(header);
        }
      });
      includedRows.push({ row, fields });
    });

    const extras = Array.from(extraHeaders);
    // Use imported values directly: no status/date conversion, sorting, merging or deduplication.
    return [
      [...columns.map(([label]) => label), ...extras],
      ...includedRows.map(({ row, fields }) => [
        ...columns.map(([, field]) => fields.get(field) ?? ""),
        ...extras.map((header) => row[header] ?? ""),
      ]),
    ];
  }

  function buildAnalysisSheets(scoped) {
    const productFlowGroups = buildProductSpecFlowAnalysis(scoped.analysisWorkOrders || scoped.workOrders, "");
    const productFlowSheets = buildProductFlowExportSheets(productFlowGroups);
    const missedPauseAnalysis = buildMissedPauseAnalysis(scoped.analysisWorkOrders || scoped.workOrders);
    const workOrderSheet = scoped.workOrders.map((order) => ({
      製令單號: order.workOrderNo,
      品名規格: order.productSpec || "",
      原始品名規格: (order.originalProductSpecs || [order.productSpec]).filter(Boolean).join("；"),
      母件編號: order.parentItemNo || "",
      需求料件: order.requiredItem || "",
      生產數量: displayValue(order.quantity),
      機台流程: order.machineRoute.join(" → "),
      機台加工彙總: (order.machineWorkSummary || [])
        .map((machine) => `${machine.stationName}｜${formatDuration(machine.processingHours)}｜${machine.segments.length}段`)
        .join("；"),
      各站等待工時: (order.stationTransitions || [])
        .map((item) => `${item.fromStation} → ${item.toStation}｜${formatDuration(item.waitingMs)}`)
        .join("；"),
      總加工工時: formatDuration(order.totalProcessingMs),
      總等待工時: formatDuration(order.totalWaitingMs),
      LeadTime: formatDuration(order.leadTimeMs),
      總時間含寬放1_3: formatDuration(order.totalTimeWithAllowance),
      利用率_含假日: formatPercentage(order.utilizationWithHoliday),
      利用率_不含假日: formatPercentage(order.utilizationWithoutHoliday),
      是否完成: order.completed ? "是" : "否",
      是否異常: order.hasAnomaly ? "是" : "否",
      疑似漏按暫停: order.hasMissedPauseWarning ? "是" : "否",
    }));

    const machineDetailSheet = scoped.workOrders.flatMap((order) =>
      (order.stationAnalysis || []).map((station) => ({
        製令單號: order.workOrderNo,
        品名規格: order.productSpec || "",
        機台: station.stationName,
        加工段數: station.segmentCount,
        總加工工時: formatDuration(station.processingHours),
        平均單段工時: formatDuration(station.averageSegmentMs),
        機台標準工時: formatDuration(station.machineStandardHours),
        機台利用率_含假日: formatPercentage(station.machineUtilizationWithHoliday),
        機台利用率_不含假日: formatPercentage(station.machineUtilizationWithoutHoliday),
        Pause次數: station.pauseCount,
        Resume次數: station.resumeCount,
        疑似漏按暫停: station.missedPauseWarning ? "是" : "否",
        原始加工段: (station.segments || [])
          .map((segment) => `${segment.segmentNo}. ${formatDateTime(segment.startAt)} → ${formatDateTime(segment.endAt)}｜${formatDuration(segment.processingMs)}`)
          .join("；"),
      }))
    );

    const partSummarySheet = calculatePartSummary(scoped.workOrders).map((item) => ({
      料件編號: item.partNo,
      品名規格: item.productSpec,
      完成數量: item.totalQuantity,
      出現次數: item.occurrenceCount,
      總加工工時: formatDuration(item.totalProcessingMs),
      總等待工時: formatDuration(item.totalWaitingMs),
      平均加工工時: formatDuration(item.averageProcessingMs),
      平均等待工時: formatDuration(item.averageWaitingMs),
      最短工時: formatDuration(item.minProcessingMs),
      最長工時: formatDuration(item.maxProcessingMs),
      使用機台數: item.machineCount,
      使用機台列表: item.machineList,
      平均LeadTime: formatDuration(item.averageLeadTimeMs),
    }));

    const machineUsageMap = new Map((scoped.machineUsageAnalysis && scoped.machineUsageAnalysis.tableRows ? scoped.machineUsageAnalysis.tableRows : []).map((item) => [item.masterKey || resolveMachineMasterKey(item.machineId, item.machineName), item]));
    const machineUtilSheet = scoped.machineMetrics.map((item) => {
      const usageSummary = machineUsageMap.get(resolveMachineMasterKey(item.machineId, item.machineName)) || {};
      return {
      機台: item.label,
      機台加工工時: formatDuration(item.processingMs),
      機台等待工時: formatDuration(item.waitingMs),
      機台標準工時: formatDuration(item.averageProcessingMs || 0),
      機台可用工時_含假日: formatDuration(item.availableHoursWithHolidayMs),
      機台可用工時_不含假日: formatDuration(item.availableHoursWithoutHolidayMs),
      機台利用率_含假日: formatPercentage(item.utilizationWithHoliday),
      機台利用率_不含假日: formatPercentage(item.utilizationWithoutHoliday),
      完成製令單數: `${usageSummary.completedOrderCount || 0} 張`,
      完成站數: `${usageSummary.completedStationCount || 0} 站`,
    };
    });

    const waitingSheet = scoped.workOrders.flatMap((order) =>
      (order.stationTransitions || []).map((item) => ({
        製令單號: order.workOrderNo,
        品名規格: order.productSpec || "",
        上一站: item.fromStation,
        下一站: item.toStation,
        上一站結束時間: formatDateTime(item.fromEndTime),
        下一站開始時間: formatDateTime(item.toStartTime),
        站間等待時間: formatDuration(item.waitingMs),
        是否跨假日: isCrossHoliday(item.fromEndTime, item.toStartTime) ? "是" : "否",
        是否異常: order.hasAnomaly ? "是" : "否",
      }))
    );

    const anomalySheet = [
      ...scoped.workOrders
        .filter((order) => order.hasAnomaly)
        .map((order) => ({
          類型: "製令單異常",
          製令單號: order.workOrderNo,
          品名規格: order.productSpec || "",
          異常原因: order.anomalies.join("；"),
        })),
      ...missedPauseAnalysis.warningRows.map((item) => ({
        類型: "疑似漏按暫停",
        製令單號: item.workOrderNo,
        品名規格: item.productSpec || "",
        異常原因: `${item.machineLabel}｜${item.reason}｜本次工時 ${formatDuration(item.processingMs)}`,
      })),
      ...state.invalidRecords.map((record) => ({
        類型: "無效資料",
        製令單號: record.workOrderNo || "",
        品名規格: record.productSpec || "",
        異常原因: record.invalidReason || "必要欄位缺漏",
      })),
    ];

    const missedPauseSheet = missedPauseAnalysis.warningRows.map((item) => ({
      工單號: item.workOrderNo,
      品名規格: item.productSpec || "",
      機台: item.machineLabel,
      操作人員: item.operator,
      開始時間: formatDateTime(item.startAt),
      結束時間: formatDateTime(item.endAt),
      本次工時: formatDuration(item.processingMs),
      超出12小時時數: formatDuration(item.exceededMs),
      異常原因: item.reason,
      目前狀態: item.statusLabel,
    }));

    const rawSheet = scoped.filteredRecords.map((record) => ({
      使用者: record.operator,
      設備編號: record.machineId,
      設備名稱: record.machineName,
      製令單號: record.workOrderNo,
      母件編號: record.parentItemNo,
      需求料件: record.requiredItem,
      品名規格: record.productSpec,
      生產數量: displayValue(record.quantity),
      動作狀態: record.actionStatus,
      紀錄時間: formatDateTime(record.recordedAt),
      等待工時: formatDuration(record.waitingHours),
      本次工時: formatDuration(record.currentWorkHours),
      總累計工時: formatDuration(record.totalWorkHours),
      總時間含寬放1_3: formatDuration(calculateWidenedDuration(record.totalWorkHours)),
    }));

    return {
      workOrderSheet,
      machineDetailSheet,
      partSummarySheet,
      productFlowDetailSheet: productFlowSheets.detailRows,
      productFlowSummarySheet: productFlowSheets.summaryRows,
      machineUtilSheet,
      missedPauseSheet,
      waitingSheet,
      anomalySheet,
      rawSheet,
    };
  }

  async function exportProductFlowReport() {
    if (!state.validRecords.length) {
      setMessage("目前沒有可匯出的品名規格流程分析資料。", "error");
      return;
    }

    try {
      const scoped = getScopedData();
      const view = getFilteredView(scoped);
      const productFlowGroups = view.filteredProductFlowAnalysis || [];
      if (!productFlowGroups.length) {
        setMessage("目前條件下沒有可匯出的品名規格流程分析資料。", "error");
        return;
      }

      const workbook = createExcelWorkbook();
      const sheets = buildProductFlowExportSheets(productFlowGroups);
      appendSheet(workbook, "品名規格流程分析", sheets.detailRows);
      appendSheet(workbook, "品名規格流程統計", sheets.summaryRows);

      const fileName = `MES品名規格流程分析_${buildRangeFileLabel(scoped.range)}.xlsx`;
      await saveExcelWorkbook(workbook, fileName);
      setMessage(`已匯出：${fileName}`, "info");
    } catch (error) {
      setMessage(error.message || "品名規格流程分析匯出失敗。", "error");
    }
  }

    async function exportWorkOrderDetailReport(workOrderNo) {
    if (!state.validRecords.length) {
      setMessage("目前沒有可匯出的工單資料。", "error");
      return;
    }

    try {
      const scoped = getScopedData();
      const order = scoped.workOrders.find((item) => item.workOrderNo === workOrderNo);
      if (!order) {
        setMessage(`找不到工單：${workOrderNo}`, "error");
        return;
      }

      const workbook = createExcelWorkbook();
      const summarySheet = [
        {
          製令單號: order.workOrderNo,
          品名規格: order.productSpec || "",
          母件編號: order.parentItemNo || "",
          需求料件: order.requiredItem || "",
          生產數量: displayValue(order.quantity),
          機台流程: order.machineRoute.join(" → "),
          總加工工時: formatDuration(order.totalProcessingMs),
          總等待工時: formatDuration(order.totalWaitingMs),
          LeadTime: formatDuration(order.leadTimeMs),
          總時間含寬放1_3: formatDuration(order.totalTimeWithAllowance),
          利用率_含假日: formatPercentage(order.utilizationWithHoliday),
          利用率_不含假日: formatPercentage(order.utilizationWithoutHoliday),
          疑似漏按暫停: order.hasMissedPauseWarning ? "是" : "否",
          是否完成: order.completed ? "是" : "否",
          是否異常: order.hasAnomaly ? "是" : "否",
          備註: order.notes.join("；"),
        },
      ];

      const machineDetailSheet = (order.stationAnalysis || []).map((station) => ({
        機台: station.stationName,
        加工段數: station.segmentCount,
        總加工工時: formatDuration(station.processingHours),
        平均單段工時: formatDuration(station.averageSegmentMs),
        機台標準工時: formatDuration(station.machineStandardHours),
        機台利用率_含假日: formatPercentage(station.machineUtilizationWithHoliday),
        機台利用率_不含假日: formatPercentage(station.machineUtilizationWithoutHoliday),
        Pause次數: station.pauseCount,
        Resume次數: station.resumeCount,
        疑似漏按暫停: station.missedPauseWarning ? "是" : "否",
        原始加工段: (station.segments || [])
          .map((segment) => `${segment.segmentNo}. ${formatDateTime(segment.startAt)} → ${formatDateTime(segment.endAt)}｜${formatDuration(segment.processingMs)}`)
          .join("；"),
      }));

      const waitingSheet = (order.stationTransitions || []).map((item) => ({
        上一站: item.fromStation,
        下一站: item.toStation,
        等待開始時間: formatDateTime(item.fromEndTime),
        等待結束時間: formatDateTime(item.toStartTime),
        站間等待時間: formatDuration(item.waitingMs),
        是否跨假日: isCrossHoliday(item.fromEndTime, item.toStartTime) ? "是" : "否",
      }));

      const missedPauseSheet = (order.missedPauseWarnings || []).map((item) => ({
        機台: item.machineLabel,
        操作人員: item.operator,
        開始時間: formatDateTime(item.startAt),
        結束時間: formatDateTime(item.endAt),
        本次工時: formatDuration(item.processingMs),
        超出12小時時數: formatDuration(item.exceededMs),
        異常原因: item.reason,
      }));

      const rawSheet = order.rawRecords.map((record) => ({
        使用者: record.operator,
        設備編號: record.machineId,
        設備名稱: record.machineName,
        製令單號: record.workOrderNo,
        母件編號: record.parentItemNo,
        需求料件: record.requiredItem,
        品名規格: record.productSpec,
        生產數量: displayValue(record.quantity),
        動作狀態: record.actionStatus,
        紀錄時間: formatDateTime(record.recordedAt),
        等待工時: formatDuration(record.waitingHours),
        本次工時: formatDuration(record.currentWorkHours),
        總累計工時: formatDuration(record.totalWorkHours),
        總時間含寬放1_3: formatDuration(calculateWidenedDuration(record.totalWorkHours)),
      }));

      appendSheet(workbook, "製令單彙總", summarySheet);
      appendSheet(workbook, "各機台工時明細", machineDetailSheet);
      appendSheet(workbook, "站間等待分析", waitingSheet);
      appendSheet(workbook, "疑似漏按暫停", missedPauseSheet);
      appendSheet(workbook, "原始資料", rawSheet);

      const fileName = `MES工單分析_${order.workOrderNo}.xlsx`;
      await saveExcelWorkbook(workbook, fileName);
      setMessage(`已匯出：${fileName}`, "info");
    } catch (error) {
      setMessage(error.message || "工單匯出失敗。", "error");
    }
  }

  function applyBasicSheetStyle(worksheet) {
    const border = {
      top: { style: "thin", color: { argb: "FFD9B8D1" } },
      bottom: { style: "thin", color: { argb: "FFD9B8D1" } },
      left: { style: "thin", color: { argb: "FFD9B8D1" } },
      right: { style: "thin", color: { argb: "FFD9B8D1" } },
    };
    const widths = [];

    worksheet.eachRow((row, rowNumber) => {
      row.eachCell((cell, colNumber) => {
        const text = cell.value == null ? "" : String(cell.value);
        widths[colNumber - 1] = Math.max(widths[colNumber - 1] || 12, Math.min(text.length + 4, 42));
        cell.font = {
          name: "Microsoft JhengHei",
          bold: rowNumber === 1,
          color: { argb: rowNumber === 1 ? "FF831843" : "FF334155" },
        };
        cell.alignment = {
          horizontal:
            rowNumber === 1 || isDurationString(text) || /%$/.test(text) || /^—$/.test(text) ? "center" : "left",
          vertical: "middle",
          wrapText: true,
        };
        cell.border = border;
        if (rowNumber === 1) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF9D7E8" },
          };
        }
      });
    });

    worksheet.columns.forEach((column, index) => {
      column.width = Math.max(widths[index] || 12, 12);
    });
  }

  function appendSheet(workbook, name, rows) {
    const worksheet = workbook.addWorksheet(name);

    if (rows && typeof rows === "object" && Array.isArray(rows.rows)) {
      const safeRows = rows.rows.length ? rows.rows : [["目前沒有資料"]];
      safeRows.forEach((row) => worksheet.addRow(row));
      if (rows.styledKind === "productFlow") {
        applyProductFlowSheetStyle(worksheet, safeRows, rows.rowRoles || []);
      } else {
        applyBasicSheetStyle(worksheet);
      }
      return;
    }

    if (Array.isArray(rows) && rows.length && Array.isArray(rows[0])) {
      rows.forEach((row) => worksheet.addRow(row));
      applyBasicSheetStyle(worksheet);
      return;
    }

    const safeRows = rows && rows.length ? rows : [{ 提示: "目前沒有資料" }];
    const headers = Object.keys(safeRows[0]);
    worksheet.addRow(headers);
    safeRows.forEach((row) => {
      worksheet.addRow(headers.map((header) => row[header] == null ? "" : row[header]));
    });
    applyBasicSheetStyle(worksheet);
  }

  function applyQuickRangePreset(preset) {
    if (preset === "custom") {
      state.dateFilter = {
        preset: "custom",
        startDate: state.dateFilter.startDate,
        endDate: state.dateFilter.endDate,
      };
      renderAll();
      return;
    }

    const range = resolveQuickRange(preset);
    state.dateFilter = {
      preset,
      startDate: range.start ? formatDateInput(range.start) : "",
      endDate: range.end ? formatDateInput(range.end) : "",
    };
    renderAll();
  }

  function syncRangeInputs(range) {
    const rangeStartInput = document.getElementById("rangeStartInput");
    const rangeEndInput = document.getElementById("rangeEndInput");
    rangeStartInput.value = state.dateFilter.startDate || (range.start ? formatDateInput(range.start) : "");
    rangeEndInput.value = state.dateFilter.endDate || (range.end ? formatDateInput(range.end) : "");
  }

  function renderRangeLabel(range) {
    const label = document.getElementById("rangeLabel");
    label.textContent = `目前查詢區間：${formatRangeLabel(range)}`;
  }

  function resolveActiveDateRange() {
    if (state.dateFilter.preset === "custom" && state.dateFilter.startDate && state.dateFilter.endDate) {
      return getCustomRange(state.dateFilter.startDate, state.dateFilter.endDate);
    }
    return resolveQuickRange(state.dateFilter.preset || "all");
  }

  function resolveExportRange(mode) {
    if (mode === "current") {
      return resolveActiveDateRange();
    }
    if (mode === "firstHalf") {
      return getHalfYearRange("first");
    }
    if (mode === "secondHalf") {
      return getHalfYearRange("second");
    }
    return getFullRange();
  }

  function resolveQuickRange(preset) {
    if (preset === "yesterday") {
      return getYesterdayRange();
    }
    if (preset === "today") {
      return getTodayRange();
    }
    if (preset === "week") {
      return getWeekRange();
    }
    if (preset === "month") {
      return getMonthRange();
    }
    if (preset === "firstHalf") {
      return getHalfYearRange("first");
    }
    if (preset === "secondHalf") {
      return getHalfYearRange("second");
    }
    return getFullRange();
  }

  function getYesterdayRange() {
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    return {
      label: "昨天",
      start: startOfDay(target),
      end: endOfDay(target),
    };
  }

  function getTodayRange() {
    const now = new Date();
    return {
      label: "今天",
      start: startOfDay(now),
      end: endOfDay(now),
    };
  }

  function getWeekRange() {
    const now = new Date();
    const day = now.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
    return {
      label: "本週",
      start: startOfDay(monday),
      end: endOfDay(sunday),
    };
  }

  function getMonthRange() {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      label: "本月",
      start: startOfDay(firstDay),
      end: endOfDay(lastDay),
    };
  }

  function getHalfYearRange(whichHalf) {
    const year = new Date().getFullYear();
    if (whichHalf === "first") {
      return {
        label: "上半年",
        start: new Date(year, 0, 1, 0, 0, 0),
        end: new Date(year, 5, 30, 23, 59, 59, 999),
      };
    }
    return {
      label: "下半年",
      start: new Date(year, 6, 1, 0, 0, 0),
      end: new Date(year, 11, 31, 23, 59, 59, 999),
    };
  }

  function getFullRange() {
    return {
      label: "全部",
      start: null,
      end: null,
    };
  }

  function getCustomRange(startDate, endDate) {
    return {
      label: "自訂日期",
      start: startOfDay(parseDateOnly(startDate)),
      end: endOfDay(parseDateOnly(endDate)),
    };
  }

  function filterByDateRange(records, range) {
    if (!range.start && !range.end) {
      return [...records];
    }
    return records.filter((record) => {
      if (!(record.recordedAt instanceof Date) || Number.isNaN(record.recordedAt.getTime())) {
        return false;
      }
      const time = record.recordedAt.getTime();
      const afterStart = !range.start || time >= range.start.getTime();
      const beforeEnd = !range.end || time <= range.end.getTime();
      return afterStart && beforeEnd;
    });
  }

  function buildRangeFileLabel(range) {
    if (!range.start && !range.end) {
      return "全部";
    }
    return `${formatDateInput(range.start)}_${formatDateInput(range.end)}`;
  }

  function formatRangeLabel(range) {
    if (!range.start && !range.end) {
      return "全部資料";
    }
    return `${formatDate(range.start)} ~ ${formatDate(range.end)}`;
  }

  function serializeRange(range) {
    return `${range.label || ""}|${range.start ? range.start.getTime() : "all"}|${range.end ? range.end.getTime() : "all"}`;
  }

  function matchesStatusFilter(order) {
    if (state.statusFilter === "completed") {
      return order.completed;
    }
    if (state.statusFilter === "incomplete") {
      return !order.completed;
    }
    if (state.statusFilter === "anomaly") {
      return order.hasAnomaly;
    }
    return true;
  }

  function matchesSearchKeyword(order, keyword) {
    if (!keyword) {
      return true;
    }
    return normalizeSearchText(order.searchText).includes(keyword);
  }

  function buildUtilizationSummary(workOrders, machineMetrics, range) {
    const eligibleOrders = workOrders.filter((item) => item.includeInUtilizationAverage);
    const metrics = machineMetrics || [];
    const averageUtilization = metrics.length ? averageNumber(metrics.map((item) => resolveDisplayUtilization(item) || 0)) : 0;
    const withHolidayUtilization =
      calculateRatio(
        metrics.reduce((sum, item) => sum + normalizeDuration(item.processingMs), 0),
        metrics.reduce((sum, item) => sum + normalizeDuration(item.availableHoursWithHolidayMs), 0)
      ) || 0;
    const withoutHolidayUtilization =
      calculateRatio(
        metrics.reduce((sum, item) => sum + normalizeDuration(item.processingMs), 0),
        metrics.reduce((sum, item) => sum + normalizeDuration(item.availableHoursWithoutHolidayMs), 0)
      ) || 0;

    return {
      averageUtilization,
      averageSampleCount: eligibleOrders.length,
      machineSampleCount: metrics.length,
      withHolidayUtilization,
      withoutHolidayUtilization,
      currentRangeUtilization: state.utilizationConfig.excludeHolidays ? withoutHolidayUtilization : withHolidayUtilization,
      rangeLabel: formatRangeLabel(range),
    };
  }

  function resolveMonthlyReferenceDate(workOrders) {
    const today = new Date();
    const hasCurrentMonth = workOrders.some((item) => isSameMonth(item.finishedAt || item.latestRecordedAt || item.startedAt, today));
    if (hasCurrentMonth) {
      return today;
    }

    const latestDate = workOrders.reduce((latest, item) => {
      const candidate = item.finishedAt || item.latestRecordedAt || item.startedAt;
      if (!(candidate instanceof Date)) {
        return latest;
      }
      if (!latest || candidate.getTime() > latest.getTime()) {
        return candidate;
      }
      return latest;
    }, null);

    return latestDate || today;
  }

  function calculateMachineUtilization(context) {
    const { records, stations, processingHoursMs, completed, hasAnomaly, startRecordCount } = context;
    const result = {
      totalHoursMs: 0,
      availableHoursWithHolidayMs: 0,
      availableHoursWithoutHolidayMs: 0,
      processingHoursMs: normalizeDuration(processingHoursMs),
      utilizationWithHoliday: null,
      utilizationWithoutHoliday: null,
      includeInAverage: false,
      note: "",
    };

    result.totalHoursMs = normalizeDuration(
      (stations || []).reduce((sum, station) => sum + calculateWindowSpanMs(station.startAt, station.endAt), 0)
    );
    result.availableHoursWithHolidayMs = normalizeDuration(
      (stations || []).reduce((sum, station) => sum + normalizeDuration(station.machineAvailableWithHolidayMs), 0)
    );
    result.availableHoursWithoutHolidayMs = normalizeDuration(
      (stations || []).reduce((sum, station) => sum + normalizeDuration(station.machineAvailableWithoutHolidayMs), 0)
    );
    result.utilizationWithHoliday = calculateRatio(result.processingHoursMs, result.availableHoursWithHolidayMs);
    result.utilizationWithoutHoliday = calculateRatio(result.processingHoursMs, result.availableHoursWithoutHolidayMs);

    if (!completed) {
      result.note = "尚未 End，先顯示目前利用率。";
      return result;
    }

    if (hasAnomaly) {
      result.note = "資料異常，不納入平均利用率。";
      return result;
    }

    if (startRecordCount > 1) {
      result.note = "多個 Start，不納入平均利用率。";
      return result;
    }

    result.includeInAverage = true;
    result.note = "可納入平均利用率。";
    return result;
  }

  function applyStationUtilization(station, records) {
    const processingMs = normalizeDuration(station.processingMs);
    const waitingMs = normalizeDuration(station.waitingAfterMs);
    const availability = calculateWindowAvailability(station.startAt, station.endAt, records);
    station.flowUtilization = calculateRatio(processingMs, processingMs + waitingMs);
    station.stationUtilization = station.flowUtilization;
    station.machineAvailableWithHolidayMs = availability.availableWithHolidayMs;
    station.machineAvailableWithoutHolidayMs = availability.availableWithoutHolidayMs;
    station.machineUtilizationWithHoliday = calculateRatio(processingMs, availability.availableWithHolidayMs);
    station.machineUtilizationWithoutHoliday = calculateRatio(processingMs, availability.availableWithoutHolidayMs);
  }

  function calculateWindowAvailability(startAt, endAt, records) {
    if (!(startAt instanceof Date) || !(endAt instanceof Date) || endAt.getTime() < startAt.getTime()) {
      return {
        totalHoursMs: 0,
        availableWithHolidayMs: 0,
        availableWithoutHolidayMs: 0,
      };
    }

    const dayWindows = getWorkingDays(startAt, endAt, records || []);
    return {
      totalHoursMs: calculateWindowSpanMs(startAt, endAt),
      availableWithHolidayMs: dayWindows.reduce((sum, item) => sum + item.availableMs, 0),
      availableWithoutHolidayMs: dayWindows.reduce((sum, item) => sum + (item.keepWithoutHoliday ? item.availableMs : 0), 0),
    };
  }

  function calculateWindowSpanMs(startAt, endAt) {
    if (!(startAt instanceof Date) || !(endAt instanceof Date)) {
      return 0;
    }
    return Math.max(endAt.getTime() - startAt.getTime(), 0);
  }

  function getWorkingDays(startAt, endAt, records) {
    const days = [];
    let cursor = startOfDay(startAt);

    while (cursor.getTime() <= endAt.getTime()) {
      const dayStart = cursor;
      const dayEnd = endOfDay(cursor);
      const overlapStart = new Date(Math.max(startAt.getTime(), dayStart.getTime()));
      const overlapEnd = new Date(Math.min(endAt.getTime(), dayEnd.getTime()));
      const overlapMs = Math.max(overlapEnd.getTime() - overlapStart.getTime(), 0);

      if (overlapMs > 0) {
        const holiday = isHoliday(dayStart);
        const keepHoliday = !holiday || hasWorkOnHoliday(records, dayStart);
        days.push({
          dateKey: formatDateInput(dayStart),
          holiday,
          keepWithoutHoliday: keepHoliday,
          overlapMs,
          availableMs: Math.max(overlapMs - DEFAULT_BREAK_MS, 0),
        });
      }

      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    }

    return days;
  }

  function hasWorkOnHoliday(records, targetDate) {
    const targetKey = formatDateInput(targetDate);
    return records.some((record) => {
      if (!(record.recordedAt instanceof Date)) {
        return false;
      }
      return formatDateInput(record.recordedAt) === targetKey && KEEP_HOLIDAY_STATUSES.has(record.actionStatus);
    });
  }

  function isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6;
  }

  function isHoliday(date) {
    return isWeekend(date) || NATIONAL_HOLIDAYS.has(formatDateInput(date));
  }

  function isCrossHoliday(startAt, endAt) {
    if (!(startAt instanceof Date) || !(endAt instanceof Date) || endAt.getTime() <= startAt.getTime()) {
      return false;
    }

    let cursor = startOfDay(startAt);
    while (cursor.getTime() <= endAt.getTime()) {
      if (isHoliday(cursor)) {
        return true;
      }
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    }
    return false;
  }

  function buildInvalidReason(record) {
    if (!record.workOrderNo) {
      return "缺少製令單號";
    }
    if (!record.actionStatus) {
      return "缺少動作狀態";
    }
    if (!record.recordedAt) {
      return "缺少紀錄時間";
    }
    return "";
  }

  function normalizeHeader(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, "")
      .replace(/[()（）]/g, "")
      .replace(/[.:：]/g, "")
      .toLowerCase();
  }

  function findMappedField(normalizedKey) {
    return Object.keys(FIELD_MAP).find((field) => FIELD_MAP[field].some((alias) => normalizeHeader(alias) === normalizedKey));
  }

  function normalizeStatus(value) {
    const raw = normalizeLooseText(value).toLowerCase();
    if (!raw) {
      return "";
    }
    if (raw.includes("start") || raw.includes("開始")) {
      return "Start";
    }
    if (raw.includes("resume") || raw.includes("恢復")) {
      return "Resume";
    }
    if (raw.includes("pause") || raw.includes("暫停")) {
      return "Pause";
    }
    if (raw.includes("end") || raw.includes("結束")) {
      return "End";
    }
    return "";
  }

  function parseDateTime(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value;
    }

    if (typeof value === "number" && window.XLSX && window.XLSX.SSF) {
      const parsed = window.XLSX.SSF.parse_date_code(value);
      if (parsed) {
        return new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H || 0, parsed.M || 0, Math.floor(parsed.S || 0));
      }
    }

    const raw = cleanString(value);
    if (!raw) {
      return null;
    }

    const normalized = toHalfWidth(raw)
      .replace(/上午/gi, "AM")
      .replace(/下午/gi, "PM")
      .replace(/[年.]/g, "/")
      .replace(/[月]/g, "/")
      .replace(/[日]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const match = normalized.match(/^(\d{4})[\/](\d{1,2})[\/](\d{1,2})(?:\s+(AM|PM|am|pm))?(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (match) {
      let hour = Number(match[5] || 0);
      const minute = Number(match[6] || 0);
      const second = Number(match[7] || 0);
      const meridiem = match[4];
      if ((meridiem === "PM" || meridiem === "pm") && hour < 12) {
        hour += 12;
      }
      if ((meridiem === "AM" || meridiem === "am") && hour === 12) {
        hour = 0;
      }
      const parsedDate = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), hour, minute, second);
      return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
    }

    const fallback = new Date(normalized);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  function parseDateOnly(value) {
    const [year, month, day] = String(value).split("-").map(Number);
    return new Date(year, (month || 1) - 1, day || 1);
  }

  function parseDurationString(value) {
    const raw = cleanString(value);
    if (!raw) {
      return 0;
    }
    const match = raw.match(/^(\d+):(\d{1,2}):(\d{1,2})$/);
    if (!match) {
      return 0;
    }
    return Number(match[1]) * 3600 * 1000 + Number(match[2]) * 60 * 1000 + Number(match[3]) * 1000;
  }

  function resolveProcessingDuration(startAt, endAt, durationFromRow) {
    if (startAt instanceof Date && endAt instanceof Date) {
      return calculateBreakDeductedWorkHours(startAt, endAt);
    }
    if (isPositiveDuration(durationFromRow)) {
      return durationFromRow;
    }
    return 0;
  }

  function calculateBreakDeductedWorkHours(startAt, endAt) {
    if (!(startAt instanceof Date) || !(endAt instanceof Date)) {
      return 0;
    }

    const rawMs = endAt.getTime() - startAt.getTime();
    if (!Number.isFinite(rawMs) || rawMs <= 0) {
      return 0;
    }

    let deductedMs = 0;
    let cursor = startOfDay(startAt);

    while (cursor.getTime() <= endAt.getTime()) {
      FIXED_BREAK_WINDOWS.forEach((window) => {
        const breakStart = new Date(
          cursor.getFullYear(),
          cursor.getMonth(),
          cursor.getDate(),
          window.startHour,
          window.startMinute,
          0,
          0
        );
        const breakEnd = new Date(
          cursor.getFullYear(),
          cursor.getMonth(),
          cursor.getDate(),
          window.endHour,
          window.endMinute,
          0,
          0
        );
        const overlapStart = Math.max(startAt.getTime(), breakStart.getTime());
        const overlapEnd = Math.min(endAt.getTime(), breakEnd.getTime());
        if (overlapEnd > overlapStart) {
          deductedMs += overlapEnd - overlapStart;
        }
      });

      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    }

    return Math.max(rawMs - deductedMs, 0);
  }

  function resolveWaitingDuration(fromRecord, toRecord) {
    if (isPositiveDuration(toRecord && toRecord.waitingHours)) {
      return toRecord.waitingHours;
    }
    if (fromRecord && toRecord && fromRecord.recordedAt instanceof Date && toRecord.recordedAt instanceof Date) {
      return Math.max(toRecord.recordedAt.getTime() - fromRecord.recordedAt.getTime(), 0);
    }
    return 0;
  }

  function calculateWidenedDuration(processingMs) {
    const seconds = Math.round(normalizeDuration(processingMs) / 1000);
    return Math.round(seconds * 1.3) * 1000;
  }

  function parseQuantity(value) {
    if (value == null || value === "") {
      return "";
    }
    const numeric = Number(String(value).replace(/,/g, "").trim());
    return Number.isNaN(numeric) ? cleanString(value) : numeric;
  }

  function summarizeOrderQuantities(orders) {
    let totalQuantity = 0;
    let hasQuantity = false;
    const unitSet = new Set();

    (orders || []).forEach((order) => {
      if (typeof order.quantity === "number" && Number.isFinite(order.quantity)) {
        totalQuantity += order.quantity;
        hasQuantity = true;
      }
      const safeUnit = cleanString(order && order.unit);
      if (safeUnit) {
        unitSet.add(safeUnit);
      }
    });

    return {
      totalQuantity,
      hasQuantity,
      unit: unitSet.size === 1 ? Array.from(unitSet)[0] : "",
      hasMixedUnits: unitSet.size > 1,
    };
  }

  function formatProductFlowQuantity(value) {
    if (!Number.isFinite(value)) {
      return "—";
    }
    return `${displayValue(value)}個`;
  }

  function calculateUnitProcessingMs(totalProcessingMs, quantity) {
    if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0) {
      return null;
    }
    return Math.round(normalizeDuration(totalProcessingMs) / quantity);
  }

  function calculateWeightedUnitProcessingMs(orders) {
    const validOrders = (orders || []).filter((order) => typeof order.quantity === "number" && Number.isFinite(order.quantity) && order.quantity > 0);
    if (!validOrders.length) {
      return null;
    }
    const totalProcessingMs = validOrders.reduce((sum, order) => sum + normalizeDuration(order.totalProcessingMs), 0);
    const totalQuantity = validOrders.reduce((sum, order) => sum + order.quantity, 0);
    return totalQuantity > 0 ? Math.round(totalProcessingMs / totalQuantity) : null;
  }

  function averageValidDurations(values) {
    const safeValues = (values || []).filter((value) => Number.isFinite(value) && value > 0);
    return safeValues.length ? average(safeValues) : null;
  }

  function formatOptionalDuration(value) {
    if (!Number.isFinite(value) || value <= 0) {
      return "—";
    }
    return formatDuration(value);
  }

  function formatQuantityWithUnit(quantity, unit) {
    if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0) {
      return "";
    }
    const safeUnit = cleanString(unit);
    return `${displayValue(quantity)}${safeUnit ? ` ${safeUnit}` : "個"}`;
  }

  function formatQuantitySummaryText(summary) {
    if (!summary || !summary.hasQuantity) {
      return "—";
    }
    const quantityText = displayValue(summary.totalQuantity);
    if (summary.hasMixedUnits) {
      return `${quantityText}（混合單位）`;
    }
    return summary.unit ? `${quantityText} ${summary.unit}` : `${quantityText}個`;
  }

  function formatWorkOrderWithQuantity(workOrderNo, quantity, unit) {
    const safeWorkOrderNo = workOrderNo || "";
    const quantityText = formatQuantityWithUnit(quantity, unit);
    if (quantityText) {
      return `${safeWorkOrderNo}（${quantityText}）`;
    }
    return safeWorkOrderNo;
  }

  function normalizeProductSpec(value) {
    if (!cleanString(value)) {
      return "";
    }
    return toHalfWidth(cleanString(value))
      .replace(/[＊*xX]/g, "×")
      .replace(/[ΨΦφØ]/g, "ψ")
      .replace(/[／]/g, "/")
      .replace(/[｜]/g, "|")
      .replace(/[、，,]/g, "")
      .replace(/\s+/g, "")
      .toUpperCase()
      .trim();
  }

  function classifyValveType(value) {
    const text = cleanString(value);
    if (text.includes("球閥")) {
      return "球閥";
    }
    if (text.includes("蝶閥")) {
      return "蝶閥";
    }
    if (text.includes("閘閥")) {
      return "閘閥";
    }
    if (text.includes("截止閥")) {
      return "截止閥";
    }
    if (text.includes("止回閥")) {
      return "止回閥";
    }
    if (text.includes("控制閥")) {
      return "控制閥";
    }
    return "其他";
  }

  function buildOrderSearchText(order) {
    const stationText = (order.stations || []).map((station) => [station.machineId, station.machineName, station.operator].filter(Boolean).join(" ")).join(" ");
    return [
      order.workOrderNo,
      order.productSpec,
      order.normalizedProductSpec,
      order.parentItemNo,
      order.requiredItem,
      ...(order.machineRoute || []),
      stationText,
    ]
      .filter(Boolean)
      .join(" ");
  }

  function resolveWorkOrderStatus(stations, lastStatusSeen, completed) {
    if (completed) {
      return "已完成";
    }
    if (!stations.length) {
      return "未形成流程";
    }
    const lastStation = stations[stations.length - 1];
    if (lastStation.isOpen || lastStatusSeen === "Start" || lastStatusSeen === "Resume") {
      return "加工中";
    }
    if (lastStatusSeen === "Pause") {
      return "等待下一站";
    }
    return "待確認";
  }

  function resolveFlowHint(stations, finalEndRecord, completed, duplicateEndRecords, proxyEndInfo) {
    if (!completed || !finalEndRecord) {
      return "";
    }
    if (duplicateEndRecords && duplicateEndRecords.length) {
      return "重複 End（不納入計算），已採用第一次 End";
    }
    if (proxyEndInfo) {
      return proxyEndInfo.sameUser ? "上一筆 Pause 後補按 End" : "End 由不同使用者按下，工時採計至前一筆 Pause";
    }
    const lastStation = stations[stations.length - 1];
    const endMachine = composeMachineLabel(finalEndRecord.machineId, finalEndRecord.machineName);
    const lastStationMachine = lastStation ? composeMachineLabel(lastStation.machineId, lastStation.machineName) : "";
    if (endMachine && lastStationMachine && endMachine !== lastStationMachine) {
      return "跨機台結束";
    }
    return "最後有效狀態為 End";
  }

  function renderBarCard(title, items, valueType) {
    if (!items.length) {
      return `
        <div class="analytics-card">
          <div class="analytics-card-title">${escapeHtml(title)}</div>
          <div class="empty-card compact-empty">目前沒有資料</div>
        </div>
      `;
    }

    const maxValue = Math.max(...items.map((item) => Number(item.value) || 0), 0);
    const rows = items
      .map((item) => {
        const width = maxValue > 0 ? ((Number(item.value) || 0) / maxValue) * 100 : 0;
        const valueLabel = valueType === "percent" ? formatPercentage(item.value) : formatDuration(item.value);
        return `
          <div class="metric-bar-row">
            <div class="metric-bar-label" title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</div>
            <div class="metric-bar-track"><span style="width:${width}%"></span></div>
            <div class="metric-bar-value">${escapeHtml(valueLabel)}</div>
          </div>
        `;
      })
      .join("");

    return `
      <div class="analytics-card">
        <div class="analytics-card-title">${escapeHtml(title)}</div>
        <div class="metric-bar-list">${rows}</div>
      </div>
    `;
  }

  function buildSummaryCard(label, value, detail, jumpTarget) {
    return `
      <div class="summary-card${jumpTarget ? " summary-card-link" : ""}" ${jumpTarget ? `data-jump-target="${escapeHtml(jumpTarget)}"` : ""}>
        <div class="summary-label">${label}</div>
        <div class="summary-value">${value}</div>
        <div class="summary-detail">${detail}</div>
      </div>
    `;
  }

  function loadMachineMaster() {
    try {
      const fixedMaster = getFixedMachineMasterEntries();
      const raw = window.localStorage ? window.localStorage.getItem(MACHINE_MASTER_STORAGE_KEY) : "";
      if (!raw) {
        return fixedMaster;
      }
      const parsed = JSON.parse(raw);
      const savedMaster = Array.isArray(parsed) ? parsed : [];
      return mergeMachineMasterEntries(fixedMaster, savedMaster);
    } catch (error) {
      return getFixedMachineMasterEntries();
    }
  }

  function saveMachineMaster(master) {
    try {
      if (window.localStorage) {
        window.localStorage.setItem(MACHINE_MASTER_STORAGE_KEY, JSON.stringify(master || []));
      }
    } catch (error) {
      // ignore localStorage issue
    }
  }

  function syncMachineMaster(records) {
    const masterMap = new Map(
      mergeMachineMasterEntries(getFixedMachineMasterEntries(), state.machineMaster || []).map((machine) => [
        cleanString(machine.masterKey) || resolveMachineMasterKey(machine.machineId, machine.machineName),
        { ...machine },
      ])
    );

    (records || []).forEach((record) => {
      const masterKey = resolveMachineMasterKey(record.machineId, record.machineName);
      if (!masterKey) {
        return;
      }

      const existing = masterMap.get(masterKey) || {
        masterKey,
        machineId: cleanString(record.machineId),
        machineName: cleanString(record.machineName),
        category: classifyMachineCategory(record.machineId, record.machineName),
        createdAt: new Date().toISOString(),
        lastSeenAt: null,
      };

      existing.machineId = cleanString(record.machineId) || existing.machineId || "";
      existing.machineName = cleanString(record.machineName) || existing.machineName || "";
      existing.category = classifyMachineCategory(existing.machineId, existing.machineName);
      existing.lastSeenAt = record.recordedAt instanceof Date ? record.recordedAt.toISOString() : existing.lastSeenAt;
      masterMap.set(masterKey, existing);
    });

    state.machineMaster = Array.from(masterMap.values()).sort((a, b) => {
      const aLabel = composeMachineLabel(a.machineId, a.machineName) || a.masterKey;
      const bLabel = composeMachineLabel(b.machineId, b.machineName) || b.masterKey;
      return aLabel.localeCompare(bLabel, "zh-Hant");
    });
    saveMachineMaster(state.machineMaster);
  }

  function resolveMachineMasterKey(machineId, machineName) {
    return cleanString(machineId) || cleanString(machineName);
  }

  function resolveMachineMasterKeyFromTransition(fromMachineKey, fromStation) {
    return cleanString(fromMachineKey) || cleanString(fromStation);
  }

  function classifyMachineCategory(machineId, machineName) {
    const text = normalizeLooseText(`${machineId || ""} ${machineName || ""}`)
      .replace(/铣/g, "銑")
      .replace(/龍門铣/g, "龍門銑");

    if (!text) {
      return "其他設備";
    }
    if (text.includes("CNC")) {
      return "CNC";
    }
    if (text.includes("鑽床")) {
      return "鑽床";
    }
    if (text.includes("傳統車床") || /^L\d+/i.test(cleanString(machineId)) || (text.includes("車床") && !text.includes("CNC"))) {
      return "傳統車床";
    }
    if (text.includes("銑床") || text.includes("龍門銑") || text.includes("铣床") || text.includes("铣")) {
      return "傳統銑床";
    }
    return "其他設備";
  }

  function getFixedMachineMasterEntries() {
    return FIXED_MACHINE_MASTER_SOURCE
      .split(/\r?\n/)
      .map((line) => cleanString(line))
      .filter(Boolean)
      .map((line) => {
        const [machineId, machineName] = line.split("｜").map((item) => cleanString(item));
        const masterKey = resolveMachineMasterKey(machineId, machineName);
        return {
          masterKey,
          machineId,
          machineName,
          category: classifyMachineCategory(machineId, machineName),
          createdAt: null,
          lastSeenAt: null,
        };
      });
  }

  function mergeMachineMasterEntries(...groups) {
    const masterMap = new Map();
    groups.flat().forEach((machine) => {
      const masterKey = cleanString(machine && machine.masterKey) || resolveMachineMasterKey(machine && machine.machineId, machine && machine.machineName);
      if (!masterKey) {
        return;
      }
      const existing = masterMap.get(masterKey) || {};
      masterMap.set(masterKey, {
        masterKey,
        machineId: cleanString(machine && machine.machineId) || cleanString(existing.machineId),
        machineName: cleanString(machine && machine.machineName) || cleanString(existing.machineName),
        category: machine && machine.category ? machine.category : existing.category || classifyMachineCategory(machine && machine.machineId, machine && machine.machineName),
        createdAt: machine && machine.createdAt ? machine.createdAt : existing.createdAt || null,
        lastSeenAt: machine && machine.lastSeenAt ? machine.lastSeenAt : existing.lastSeenAt || null,
      });
    });
    return Array.from(masterMap.values()).sort((a, b) => {
      const aLabel = composeMachineLabel(a.machineId, a.machineName) || a.masterKey;
      const bLabel = composeMachineLabel(b.machineId, b.machineName) || b.masterKey;
      return aLabel.localeCompare(bLabel, "zh-Hant");
    });
  }

  function calculateIdleDays(lastProcessedAt, referenceDate) {
    if (!(lastProcessedAt instanceof Date) || !(referenceDate instanceof Date)) {
      return null;
    }
    const start = startOfDay(lastProcessedAt).getTime();
    const end = startOfDay(referenceDate).getTime();
    if (end < start) {
      return 0;
    }
    return Math.floor((end - start) / (24 * 60 * 60 * 1000));
  }

  function mapAndSortNumeric(map) {
    return Array.from(map.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  }

  function isDuplicateEndRecord(baseEndRecord, candidateEndRecord) {
    if (!baseEndRecord || !candidateEndRecord) {
      return false;
    }
    return (
      cleanString(baseEndRecord.machineId) === cleanString(candidateEndRecord.machineId) &&
      cleanString(baseEndRecord.machineName) === cleanString(candidateEndRecord.machineName) &&
      cleanString(baseEndRecord.operator) === cleanString(candidateEndRecord.operator)
    );
  }

  function composeMachineLabel(machineId, machineName) {
    const id = cleanString(machineId);
    const name = cleanString(machineName);
    if (id && name) {
      return `${id} ${name}`;
    }
    return id || name || "";
  }

  function getMachineKey(machineId, machineName) {
    const id = cleanString(machineId);
    const name = cleanString(machineName);
    if (id && name) {
      return `${id}__${name}`;
    }
    return id || name || "";
  }

  function resolveDisplayUtilization(item) {
    if (!item) {
      return 0;
    }
    return state.utilizationConfig.excludeHolidays ? item.machineUtilizationWithoutHoliday ?? item.utilizationWithoutHoliday ?? 0 : item.machineUtilizationWithHoliday ?? item.utilizationWithHoliday ?? 0;
  }

  function average(values) {
    if (!values.length) {
      return 0;
    }
    return Math.round(values.reduce((sum, value) => sum + (Number(value) || 0), 0) / values.length);
  }

  function averageNumber(values) {
    const filtered = values.filter((value) => typeof value === "number" && Number.isFinite(value));
    if (!filtered.length) {
      return null;
    }
    return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
  }

  function calculateRatio(numerator, denominator) {
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
      return null;
    }
    return Math.max(Math.min(numerator / denominator, 1), 0);
  }

  function getConfiguredDailyAvailableMs() {
    const dailyHours = Number(state.utilizationConfig && state.utilizationConfig.dailyHours);
    const safeHours = Number.isFinite(dailyHours) && dailyHours > 0 ? dailyHours : DEFAULT_MACHINE_AVAILABLE_HOURS;
    return normalizeDuration(safeHours * 60 * 60 * 1000);
  }

  function normalizeDuration(value) {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
  }

  function isPositiveDuration(value) {
    return normalizeDuration(value) > 0;
  }

  function formatDuration(value) {
    const ms = normalizeDuration(value);
    const totalSeconds = Math.max(Math.round(ms / 1000), 0);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function formatPercentage(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return "—";
    }
    return `${(value * 100).toFixed(1)}%`;
  }

  function formatDateTime(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return "—";
    }
    return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
  }

  function formatDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return "—";
    }
    return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
  }

  function formatDateInput(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return "";
    }
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function displayValue(value) {
    if (value === "" || value == null) {
      return "未填";
    }
    return String(value);
  }

  function cleanString(value) {
    return value == null ? "" : normalizeImportedText(String(value)).trim();
  }

  function normalizeSearchText(value) {
    return normalizeLooseText(value).replace(/\s+/g, "").toLocaleLowerCase();
  }

  function normalizeLooseText(value) {
    return toHalfWidth(cleanString(value)).replace(/\s+/g, " ").trim();
  }

  function normalizeImportedText(value) {
    return String(value == null ? "" : value)
      .replace(/^\uFEFF/, "")
      .replace(/\u0000/g, "")
      .normalize("NFC");
  }

  function toHalfWidth(value) {
    return String(value || "")
      .replace(/[！-～]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
      .replace(/\u3000/g, " ");
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  }

  function endOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
  }

  function firstNonEmpty(values) {
    return values.find((value) => value !== "" && value != null) || "";
  }

  function isSameMonth(left, right) {
    return left instanceof Date && right instanceof Date && left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
  }

  function setMessage(text, type) {
    state.message = text || "";
    state.messageType = type || "info";
    renderMessage();
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
})();



