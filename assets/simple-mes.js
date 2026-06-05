(function () {
  const SESSION_KEY = "mes_access_granted_v1";
  const PASSWORD_HASH = "e8843c11623b0e6bfc0921ee2f86b4f127c5cac825de60c8fcfbc2918aee312b";
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
  const KEEP_HOLIDAY_STATUSES = new Set(["Start", "Resume", "End"]);
  const NATIONAL_HOLIDAYS = new Set([]);
  const MACHINE_MASTER_STORAGE_KEY = "mes_machine_master_v1";
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

  try {
    if (sessionStorage.getItem(SESSION_KEY) !== PASSWORD_HASH) {
      window.location.replace("./index.html");
      return;
    }
  } catch (error) {
    window.location.replace("./index.html");
    return;
  }

  renderShell();
  bindEvents();
  renderAll();

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

        <section class="panel section-block" id="machine-utilization">
          <div class="section-title">
            <div>
              <h3>加工工時占比分析</h3>
              <p>依本期間各機台實際加工工時占比，整理加工量集中程度、閒置狀態與未使用設備。機台主檔會依匯入資料自動新增，不會因本次未出現而刪除。</p>
            </div>
          </div>
          <div id="machineUsageSection"></div>
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

      try {
        ensureXlsxReady();
        const result = await parseWorkbookFile(file);
        analyzeRows(result.rows, result.sourceLabel);
        setMessage(`資料檔案已完成分析：${result.sourceLabel}`, "info");
      } catch (error) {
        setMessage(error.message || "Excel 匯入失敗。", "error");
      } finally {
        event.target.value = "";
      }
    });

    analyzeTextBtn.addEventListener("click", () => {
      const text = pasteInput.value.trim();
      if (!text) {
        setMessage("請先貼上 TSV 或 tab 分隔資料。", "error");
        return;
      }

      try {
        const rows = parseTabularText(text);
        analyzeRows(rows, "貼上資料");
        setMessage("貼上資料已完成分析。", "info");
      } catch (error) {
        setMessage(error.message || "貼上資料分析失敗。", "error");
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
      };
    });
    const averageWaitingMs = stationTransitions.length ? Math.round(totalWaitingMs / stationTransitions.length) : 0;
    const flowUtilization = calculateRatio(totalProcessingMs, leadTimeMs);

    return {
      workOrderNo,
      productSpec: firstNonEmpty(records.map((item) => item.productSpec)),
      normalizedProductSpec: firstNonEmpty(records.map((item) => item.normalizedProductSpec)),
      quantity: firstNonEmpty(records.map((item) => item.quantity)),
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
      .filter((order) => order.completed && !order.hasAnomaly && order.normalizedProductSpec)
      .forEach((order) => {
        if (!groups.has(order.normalizedProductSpec)) {
          groups.set(order.normalizedProductSpec, []);
        }
        groups.get(order.normalizedProductSpec).push(order);
      });

    return Array.from(groups.entries())
      .map(([normalizedProductSpec, orders]) => {
        const processing = orders.map((item) => item.totalProcessingMs);
        const waiting = orders.map((item) => item.totalWaitingMs);
        const lead = orders.map((item) => item.leadTimeMs);

        return {
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
    const standardMap = new Map(standards.map((item) => [item.normalizedProductSpec, item]));
    const partMachineStandardMap = new Map();
    const machineStandardMap = new Map();

    workOrders
      .filter((order) => order.completed && !order.hasAnomaly)
      .forEach((order) => {
        (order.machineWorkSummary || []).forEach((machine) => {
          if (order.normalizedProductSpec && machine.machineKey) {
            const partMachineKey = `${order.normalizedProductSpec}::${machine.machineKey}`;
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
        const standard = order.normalizedProductSpec ? standardMap.get(order.normalizedProductSpec) : null;
        const primaryMachineKey = (order.machineKeys || [])[0] || "";
        const partMachineKey = order.normalizedProductSpec && primaryMachineKey ? `${order.normalizedProductSpec}::${primaryMachineKey}` : "";
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
      if (!groups.has(order.normalizedProductSpec)) {
        groups.set(order.normalizedProductSpec, []);
      }
      groups.get(order.normalizedProductSpec).push(order);
    });

    return Array.from(groups.entries())
      .map(([normalizedProductSpec, orders]) => {
        const sortedOrders = [...orders].sort((a, b) => {
          const aTime = a.startedAt ? a.startedAt.getTime() : Number.MAX_SAFE_INTEGER;
          const bTime = b.startedAt ? b.startedAt.getTime() : Number.MAX_SAFE_INTEGER;
          return aTime - bTime || a.workOrderNo.localeCompare(b.workOrderNo);
        });
        const eligibleOrders = sortedOrders.filter((order) => order.completed && !order.hasAnomaly);

        return {
          normalizedProductSpec,
          productSpec: sortedOrders[0].productSpec || normalizedProductSpec,
          orderCount: sortedOrders.length,
          completedCount: sortedOrders.filter((item) => item.completed).length,
          includeCount: eligibleOrders.length,
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
      if (!groups.has(order.normalizedProductSpec)) {
        groups.set(order.normalizedProductSpec, []);
      }
      groups.get(order.normalizedProductSpec).push(order);
    });

    const keyword = normalizeSearchText(searchTerm);

    return Array.from(groups.entries())
      .map(([normalizedProductSpec, orders]) => {
        const sortedOrders = [...orders].sort((a, b) => {
          const aTime = a.startedAt ? a.startedAt.getTime() : Number.MAX_SAFE_INTEGER;
          const bTime = b.startedAt ? b.startedAt.getTime() : Number.MAX_SAFE_INTEGER;
          return aTime - bTime || a.workOrderNo.localeCompare(b.workOrderNo);
        });
        const eligibleOrders = sortedOrders.filter((order) => order.completed && !order.hasAnomaly);
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
            target.weight += order.completed && !order.hasAnomaly ? 10 : 1;
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

          return {
            ...order,
            machineCellMap,
            transitionCellMap,
            flowLeadTimeMs,
            flowAllowanceMs,
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
            const routeEligibleOrders = routeGroup.orders.filter((order) => order.completed && !order.hasAnomaly);
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
          normalizedProductSpec,
          productSpec: sortedOrders[0] && sortedOrders[0].productSpec ? sortedOrders[0].productSpec : normalizedProductSpec,
          orderCount: sortedOrders.length,
          analysisSampleCount: eligibleOrders.length,
          machineColumns,
          transitionColumns,
          displayColumns,
          routeGroups,
          orders: orderRows,
          machineAverages,
          transitionAverages,
          averageTotalProcessingMs: eligibleOrders.length ? average(eligibleOrders.map((order) => order.totalProcessingMs)) : 0,
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
      { type: "fixed", key: "workOrderNo", headerLabel: "製令單號" },
      ...(routeGroup.displayColumns || []).map((column) => ({
        ...column,
        headerLabel: getProductFlowColumnHeader(column),
      })),
      { type: "fixed", key: "totalProcessingMs", headerLabel: "總工時" },
      { type: "fixed", key: "totalWaitingMs", headerLabel: "總等待時間" },
      { type: "fixed", key: "flowAllowanceMs", headerLabel: "總時間(含寬放1.3)" },
    ];

    const machineAverageMap = new Map((routeGroup.machineAverages || []).map((item) => [item.machineKey, item.averageMs]));
    const waitingAverageMap = new Map((routeGroup.waitingAverages || []).map((item) => [item.transitionKey, item.averageMs]));

    const bodyRows = (routeGroup.orders || []).map((order) =>
      headerColumns.map((column) => {
        if (column.key === "workOrderNo") {
          return order.workOrderNo;
        }
        if (column.key === "totalProcessingMs") {
          return formatDuration(order.totalProcessingMs);
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
        `分析樣本數：${group.analysisSampleCount} 筆`,
        `平均總工時：${formatDuration(group.averageTotalProcessingMs)}`,
        `平均等待時間：${formatDuration(group.averageTotalWaitingMs)}`,
        `平均LeadTime：${formatDuration(group.averageLeadTimeMs)}`,
        `平均總時間(含寬放1.3)：${formatDuration(group.averageAllowanceMs)}`,
      ]);
      detailRowRoles.push("kpi");
      summaryRows.push([`品名規格：${group.productSpec}`]);
      summaryRowRoles.push("title");
      summaryRows.push([
        `分析樣本數：${group.analysisSampleCount} 筆`,
        `平均總工時：${formatDuration(group.averageTotalProcessingMs)}`,
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

  function calculateOperatorSummary(workOrders) {
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
            workOrders: new Set(),
            machines: new Set(),
            productSpecs: new Set(),
            latestRecordAt: null,
            records: [],
          });
        }

        const target = operatorMap.get(operator);
        const stationName = composeMachineLabel(station.machineId, station.machineName) || "未填機台";
        const markAt = station.endAt instanceof Date ? station.endAt : station.startAt;

        target.totalProcessingMs += normalizeDuration(station.processingMs);
        target.segmentCount += 1;
        target.workOrders.add(order.workOrderNo);
        target.machines.add(stationName);
        if (order.productSpec) {
          target.productSpecs.add(order.productSpec);
        }
        if (markAt instanceof Date && (!target.latestRecordAt || markAt.getTime() > target.latestRecordAt.getTime())) {
          target.latestRecordAt = markAt;
        }

        target.records.push({
          workOrderNo: order.workOrderNo,
          productSpec: order.productSpec || "未填品名規格",
          machineName: stationName,
          startAt: station.startAt,
          endAt: station.endAt,
          processingMs: normalizeDuration(station.processingMs),
          statusLabel: order.statusLabel,
        });
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
        latestRecordAt: item.latestRecordAt,
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
      if (!normalizedProductSpec) {
        return;
      }

      if (!productMap.has(normalizedProductSpec)) {
        productMap.set(normalizedProductSpec, {
          normalizedProductSpec,
          productSpec: order.productSpec || normalizedProductSpec,
          originalSpecs: new Set(),
          orderSet: new Set(),
          operatorMap: new Map(),
        });
      }

      const target = productMap.get(normalizedProductSpec);
      if (order.productSpec) {
        target.originalSpecs.add(order.productSpec);
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
            machineSet: new Set(),
            workOrderSet: new Set(),
          });
        }

        const operatorTarget = target.operatorMap.get(operator);
        operatorTarget.totalProcessingMs += normalizeDuration(station.processingMs);
        operatorTarget.segmentCount += 1;
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
        if (processingMs > 0 && order.completed && !order.hasAnomaly) {
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
      .filter((order) => order.completed && !order.hasAnomaly)
      .forEach((order) => {
        (order.machineWorkSummary || []).forEach((item) => {
          if (!item.machineKey || !normalizeDuration(item.processingHours)) {
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
    renderArchiveSection(scoped);
    renderMessage();
    renderFlowTable(view);
    renderStandardTable(view);
    renderScheduleTable(view);
    renderWaitingAnalytics(view);
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

    summaryGrid.innerHTML = [
      buildSummaryCard("資料來源", escapeHtml(state.sourceLabel || "尚未載入資料"), state.sourceLabel ? "目前顯示的是已載入資料。" : "請上傳 Excel / CSV 或貼上 TSV。"),
      buildSummaryCard("機台啟停原始筆數", String(state.rawRows.length || 0), "匯入前的原始啟停紀錄數量"),
      buildSummaryCard("機台啟停有效筆數", String(state.validRecords.length || 0), `無效資料 ${state.invalidRecords.length || 0} 筆`),
      buildSummaryCard("目前顯示製令單", String(view.filteredWorkOrders.length || 0), `全部資料 ${scoped.workOrders.length || 0} 張`),
      buildSummaryCard("已完成數", String(completedCount || 0), `未完成 ${incompleteCount} 張｜異常 ${anomalyCount} 張`),
      buildSummaryCard("總加工工時", formatDuration(totalProcessingMs), "目前篩選區間內的總加工工時"),
      buildSummaryCard("總等待時間", formatDuration(totalWaitingMs), "只統計跨機台的站間等待"),
      buildSummaryCard("平均機台利用率", formatPercentage(utilization.averageUtilization), `共統計 ${utilization.machineSampleCount} 台機台`),
      buildSummaryCard("本期間機台利用率", formatPercentage(utilization.currentRangeUtilization), `區間：${utilization.rangeLabel}`),
      buildSummaryCard("含假日利用率", formatPercentage(utilization.withHolidayUtilization), "可用工時包含假日"),
      buildSummaryCard("不含假日利用率", formatPercentage(utilization.withoutHolidayUtilization), "可用工時排除未開工假日"),
      buildSummaryCard("全部資料數", String(scoped.workOrders.length || 0), "可搭配搜尋與篩選查看"),
    ].join("");
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
              ${flowHint}
              ${notes}
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
                <div class="foot-note">製令單數量 ${group.orderCount}｜已完成 ${group.completedCount}｜有效樣本 ${group.includeCount}</div>
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
                    <th>製令單號</th>
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
                            <summary class="link-summary"><span class="mono primary-text">${escapeHtml(order.workOrderNo)}</span></summary>
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
                          <td>${order.completed && !order.hasAnomaly ? '<span class="chip complete">是</span>' : '<span class="chip manual">否</span>'}</td>
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
              .slice(1, -3)
              .map((column) =>
                column.type === "machine"
                  ? `<th class="flow-dynamic-col">${escapeHtml(column.headerLabel)}</th>`
                  : `<th class="flow-wait-col">${escapeHtml(column.headerLabel)}</th>`
              )
              .join("");

            const bodyRows = tableModel.bodyRows
              .map((row) => {
                const dynamicCells = row
                  .slice(1, -3)
                  .map((value) => `<td class="mono">${escapeHtml(value)}</td>`)
                  .join("");

                return `
                  <tr>
                    <td class="mono primary-text">${escapeHtml(row[0])}</td>
                    ${dynamicCells}
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
                  .slice(1, -3)
                  .map((value) =>
                    value === "—" ? `<td class="flow-table-muted">—</td>` : `<td class="mono">${escapeHtml(value)}</td>`
                  )
                  .join("");
                const totalWork = footerRow.cells[footerRow.cells.length - 3];
                const totalWaiting = footerRow.cells[footerRow.cells.length - 2];
                const totalAllowance = footerRow.cells[footerRow.cells.length - 1];

                return `
                  <tr class="product-flow-footer-row">
                    <td class="product-flow-footer-title">${escapeHtml(footerRow.label)}</td>
                    ${dynamicCells}
                    ${totalWork === "—" ? `<td class="flow-table-muted">—</td>` : `<td class="mono">${escapeHtml(totalWork)}</td>`}
                    ${totalWaiting === "—" ? `<td class="flow-table-muted">—</td>` : `<td class="mono">${escapeHtml(totalWaiting)}</td>`}
                    ${totalAllowance === "—" ? `<td class="flow-table-muted">—</td>` : `<td class="mono">${escapeHtml(totalAllowance)}</td>`}
                  </tr>
                `;
              })
              .join("");

            return `
              <div class="product-flow-route-card">
                <div class="product-flow-route-title">${escapeHtml(routeGroup.routeLabel)}</div>
                <div class="foot-note">流程樣本 ${routeGroup.orderCount} 張｜有效樣本 ${routeGroup.analysisSampleCount} 張</div>
                <div class="table-shell nested-table-shell product-flow-table-shell">
                  <table>
                    <thead>
                      <tr>
                        <th>製令單號</th>
                        ${headerCells}
                        <th>總工時</th>
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
                <div class="foot-note">製令單數量 ${group.orderCount}｜分析樣本數 ${group.analysisSampleCount}</div>
              </div>
              <div class="comparison-summary-grid">
                <span>平均總工時 ${formatDuration(group.averageTotalProcessingMs)}</span>
                <span>平均等待 ${formatDuration(group.averageTotalWaitingMs)}</span>
                <span>平均 Lead Time ${formatDuration(group.averageLeadTimeMs)}</span>
                <span>平均總時間 ${formatDuration(group.averageAllowanceMs)}</span>
              </div>
            </summary>
            <div class="detail-summary-grid product-flow-group-summary">
              <div class="detail-summary-item">
                <strong>分析樣本數</strong>
                <span>${group.analysisSampleCount} 筆</span>
                <span>歷史製令單 ${group.orderCount} 張</span>
              </div>
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
            <td>${escapeHtml(record.statusLabel)}</td>
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
    return cleanString(order.requiredItem) || cleanString(order.parentItemNo) || cleanString(order.normalizedProductSpec) || cleanString(order.productSpec);
  }

  function calculatePartSummary(workOrders) {
    const groups = new Map();

    (workOrders || [])
      .filter((order) => order.completed && !order.hasAnomaly && normalizeDuration(order.totalProcessingMs) > 0)
      .forEach((order) => {
        const key = groupByPartNo(order);
        if (!key) {
          return;
        }
        if (!groups.has(key)) {
          groups.set(key, {
            partNo: key,
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
      appendSheet(workbook, "異常資料", sheets.anomalySheet);
      appendSheet(workbook, "原始資料", sheets.rawSheet);

      const fileName = `MES分析報表_${buildRangeFileLabel(range)}.xlsx`;
      await saveExcelWorkbook(workbook, fileName);
      setMessage(`已匯出：${fileName}`, "info");
    } catch (error) {
      setMessage(error.message || "Excel 匯出失敗。", "error");
    }
  }

  async function exportAllAnalysisReport() {
    if (!state.validRecords.length) {
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
      appendSheet(workbook, "異常資料", sheets.anomalySheet);
      appendSheet(workbook, "原始資料", sheets.rawSheet);

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

      const fileName = `MES年度歸檔_${selectedYear}.xlsx`;
      await saveExcelWorkbook(workbook, fileName);
      setMessage(`已匯出：${fileName}`, "info");
    } catch (error) {
      setMessage(error.message || "年度歷史資料匯出失敗。", "error");
    }
  }

  function buildAnalysisSheets(scoped) {
    const productFlowGroups = buildProductSpecFlowAnalysis(scoped.analysisWorkOrders || scoped.workOrders, "");
    const productFlowSheets = buildProductFlowExportSheets(productFlowGroups);
    const workOrderSheet = scoped.workOrders.map((order) => ({
      製令單號: order.workOrderNo,
      品名規格: order.productSpec || "",
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
      ...state.invalidRecords.map((record) => ({
        類型: "無效資料",
        製令單號: record.workOrderNo || "",
        品名規格: record.productSpec || "",
        異常原因: record.invalidReason || "必要欄位缺漏",
      })),
    ];

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

  function buildSummaryCard(label, value, detail) {
    return `
      <div class="summary-card">
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



