(function (host) {
  "use strict";
  const CONFIG = Object.freeze({
    spreadsheetId: "1hepWIYP6lZU2bAb7VYF9n4rTnW33Jc2IFXOu7NLFNqg",
    clientId: "601470172678-hhe9vfkh7qt2dq2pmt8saq99fer67o4u.apps.googleusercontent.com",
    sheetName: "加工紀錄表",
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
  });
  const REQUIRED = ["operator", "machineId", "machineName", "workOrderNo", "parentItemNo", "requiredItem", "productSpec", "quantity", "actionStatus", "recordedAt"];
  const headerKey = (value) => String(value ?? "").normalize("NFC").replace(/^\uFEFF/, "").trim().replace(/\s+/g, "").toLowerCase();
  const valueOf = (cell) => {
    const value = cell?.effectiveValue || {};
    if (Object.hasOwn(value, "stringValue")) return value.stringValue;
    if (Object.hasOwn(value, "numberValue")) return value.numberValue;
    if (Object.hasOwn(value, "boolValue")) return value.boolValue;
    return cell?.formattedValue ?? value.errorValue?.message ?? "";
  };
  function serialDate(value) {
    // Sheets serials represent spreadsheet-local wall time, not UTC instants.
    const seconds = Math.round(value * 86400);
    const date = new Date(Date.UTC(1899, 11, 30) + seconds * 1000);
    if (!Number.isFinite(+date)) return String(value);
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getUTCFullYear()}/${pad(date.getUTCMonth() + 1)}/${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
  }
  function cellValue(cell, field, header) {
    const value = valueOf(cell);
    if (headerKey(header) === "id") return cell?.formattedValue ?? value;
    const type = cell?.effectiveFormat?.numberFormat?.type;
    if (typeof value === "number" && (field === "recordedAt" || type === "DATE" || type === "DATE_TIME")) return serialDate(value);
    // Keep displayed identifiers (including leading zeros), but do not localize quantities.
    if (["machineId", "machineName", "workOrderNo", "parentItemNo", "requiredItem"].includes(field)) return cell?.formattedValue ?? value;
    if (typeof value === "number" && type === "TIME") {
      const total = Math.round(value * 86400), sign = total < 0 ? "-" : "", n = Math.abs(total);
      return `${sign}${Math.floor(n / 3600)}:${String(Math.floor(n / 60) % 60).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
    }
    return value;
  }
  function parseSheetData(payload, findField) {
    if (payload?.properties?.timeZone !== "Asia/Taipei") throw new Error("Google Sheets 時區不是 Asia/Taipei，請確認試算表設定；未取代目前資料。");
    const sheet = payload.sheets?.find((item) => item.properties?.title === CONFIG.sheetName);
    if (!sheet || !Array.isArray(sheet.data)) throw new Error("找不到「加工紀錄表」或回傳資料不完整；未取代目前資料。");
    const matrix = [];
    for (const block of sheet.data) {
      if (!Array.isArray(block.rowData)) continue;
      block.rowData.forEach((row, r) => {
        const target = matrix[(block.startRow || 0) + r] ||= [];
        (row.values || []).forEach((cell, c) => { target[(block.startColumn || 0) + c] = cell; });
      });
    }
    const headerIndex = matrix.findIndex((cells) => {
      const fields = new Set((cells || []).map((cell) => findField(String(valueOf(cell)))));
      return REQUIRED.every((field) => fields.has(field)) && cells.some((cell) => headerKey(valueOf(cell)) === "id");
    });
    if (headerIndex < 0) throw new Error("找不到完整表頭：需包含 ID、使用者、設備編號／名稱、製令單號、母件編號、需求料件、品名規格、生產數量、動作狀態、紀錄時間。請核對欄名，原資料保留。");
    const headerCells = matrix[headerIndex];
    const width = matrix.slice(headerIndex).reduce((max, cells) => Math.max(max, cells?.length || 0), 0);
    const headers = Array.from({ length: width }, (_, i) => String(valueOf(headerCells[i])).normalize("NFC").replace(/^\uFEFF/, "").trim());
    const seen = new Set(), mapped = new Set();
    headers.forEach((header, i) => {
      if (!header) {
        if (matrix.slice(headerIndex + 1).some((cells) => valueOf(cells?.[i]) !== "")) throw new Error(`第 ${i + 1} 欄有資料但缺少欄名，請修正表頭後重試。`);
        return;
      }
      const field = findField(header), key = headerKey(header);
      if (seen.has(key) || (field && mapped.has(field)) || ["__proto__", "constructor", "prototype"].includes(key)) throw new Error("表頭重複或含不支援的名稱；為避免覆蓋原始欄位，同步已停止。");
      seen.add(key);
      if (field) mapped.add(field);
    });
    if (matrix.slice(0, headerIndex).some((cells) => (cells || []).filter((cell) => valueOf(cell) !== "").length > 1)) throw new Error("表頭前有多欄資料，無法確認是否為原始事件；請先確認表頭位置，原資料保留。");
    const rows = [];
    matrix.slice(headerIndex + 1).forEach((cells) => {
      if (!(cells || []).some((cell) => valueOf(cell) !== "")) return;
      if (headers.every((header, i) => !header || headerKey(valueOf(cells?.[i])) === headerKey(header))) throw new Error("資料中出現重複表頭，同步停止以避免誤讀。");
      const row = {};
      headers.forEach((header, i) => { if (header) row[header] = cellValue(cells?.[i], findField(header), header); });
      rows.push(row);
    });
    if (!rows.length) throw new Error("加工紀錄表沒有資料；為避免清空已載入資料，未套用本次同步。");
    return { rows, headers: headers.filter(Boolean), headerRow: headerIndex + 1 };
  }
  function createController(options) {
    const { findField, applyRows, onStatus } = options;
    const fetchData = options.fetch || host.fetch.bind(host), now = options.now || Date.now;
    let token = "", expiresAt = 0, client = null, generation = 0, pendingAuthGeneration = null, controller = null, timer = null;
    let manualLoading = false, busy = false, status = "等待 Google 授權", error = "", lastSuccessAt = null, rowCount = null, headerRow = null;
    const validToken = () => !!token && now() < expiresAt - 30000;
    function emit() { onStatus({ status, error, lastSuccessAt, rowCount, headerRow, busy, manualLoading, authorized: validToken(), authorizing: pendingAuthGeneration !== null }); }
    function cancel() {
      generation += 1;
      pendingAuthGeneration = null;
      if (controller) controller.abort();
      controller = null;
      busy = false;
    }
    function fail(message) { status = "同步失敗，目前顯示舊資料（若先前尚未載入則無資料）"; error = message; emit(); }
    async function sync() {
      if (busy || manualLoading || pendingAuthGeneration !== null) return false;
      if (!validToken()) { token = ""; status = "需要重新 Google 授權"; error = "沒有有效授權，請按 Google 授權；現有資料未更新。"; emit(); return false; }
      busy = true;
      const request = ++generation, abort = new AbortController();
      controller = abort;
      status = "正在讀取完整加工紀錄表…"; error = ""; emit();
      const timeout = setTimeout(() => abort.abort(), 120000);
      try {
        const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.spreadsheetId}`);
        url.searchParams.set("ranges", `'${CONFIG.sheetName}'`);
        url.searchParams.set("fields", "properties(timeZone,locale),sheets(properties(title),data(startRow,startColumn,rowData(values(effectiveValue,formattedValue,effectiveFormat(numberFormat)))))");
        const response = await fetchData(url.href, { method: "GET", headers: { Authorization: `Bearer ${token}` }, signal: abort.signal, cache: "no-store", credentials: "omit", redirect: "error", referrerPolicy: "no-referrer" });
        if (request !== generation) return false;
        if (response.status === 401) { token = ""; expiresAt = 0; throw new Error("Google 授權已失效，請重新授權。"); }
        if (response.status === 403) throw new Error("Google 拒絕存取（403）：請確認帳號有試算表讀取權限、API 已啟用及授權範圍正確。");
        if (response.status === 404) throw new Error("找不到指定試算表（404），請確認 Spreadsheet ID 與讀取權限。");
        if (response.status === 429) throw new Error("Google API 讀取額度暫時超限（429），請稍後重新同步。");
        if (!response.ok) throw new Error(`Google Sheets 讀取失敗（HTTP ${response.status}），請稍後重試。`);
        const data = parseSheetData(await response.json(), findField);
        if (request !== generation) return false;
        status = "正在依原有 MES 邏輯分析…"; emit();
        applyRows(data.rows);
        lastSuccessAt = now(); rowCount = data.rows.length; headerRow = data.headerRow;
        status = "同步成功，目前顯示 Google Sheets 資料"; error = "";
        return true;
      } catch (problem) {
        if (request !== generation) return false;
        const message = problem.name === "AbortError" ? "同步逾時，未取代現有資料。" : problem instanceof TypeError ? "網路或跨網域連線失敗，請確認網路後重試。" : problem.message;
        fail(message || "同步失敗，現有資料保留。");
        return false;
      } finally {
        clearTimeout(timeout);
        if (request === generation) { busy = false; controller = null; emit(); }
      }
    }
    function authorize() {
      if (busy || manualLoading || pendingAuthGeneration !== null) return;
      if (options.environmentError?.()) { error = options.environmentError(); status = "Google 授權無法啟動"; emit(); return; }
      const oauth = (options.getOAuth || (() => host.google?.accounts?.oauth2))();
      if (!oauth) { status = "Google 授權服務尚未載入"; error = "請檢查網路或瀏覽器阻擋設定，再按 Google 授權。Excel 匯入仍可使用。"; emit(); return; }
      const request = ++generation;
      pendingAuthGeneration = request;
      status = "請在 Google 視窗選擇帳號並授權"; error = ""; emit();
      try {
        client = oauth.initTokenClient({ client_id: CONFIG.clientId, scope: CONFIG.scope, include_granted_scopes: false,
          callback: (response) => {
            if (request !== generation) return;
            pendingAuthGeneration = null;
            if (response.error || !response.access_token || !String(response.scope || "").split(/\s+/).includes(CONFIG.scope) || !(Number(response.expires_in) > 0)) { token = ""; fail("Google 授權未完成或未授予 Sheets 唯讀權限，請重新授權。"); return; }
            token = response.access_token; expiresAt = now() + Number(response.expires_in) * 1000;
            clearTimeout(timer);
            timer = setTimeout(() => { if (!validToken() && !busy) { token = ""; status = "Google 授權已到期，重新同步前請再次授權"; emit(); } }, Math.max(0, expiresAt - now() - 29000));
            sync();
          },
          error_callback: () => { if (request === generation) { pendingAuthGeneration = null; fail("Google 授權視窗已關閉或被阻擋，請再按授權按鈕。"); } },
        });
        client.requestAccessToken({ prompt: "select_account" });
      } catch (_) { pendingAuthGeneration = null; fail("無法開啟 Google 授權，請重新整理或使用支援的瀏覽器。"); }
    }
    function beginManual() { cancel(); manualLoading = true; status = "正在手動匯入；已取消未完成的 Google 同步"; error = ""; emit(); }
    function endManual(success) { manualLoading = false; status = success ? "目前顯示手動匯入資料（非 Google 最新同步）" : "手動匯入失敗，Google 同步未套用"; emit(); }
    function disconnect() { cancel(); clearTimeout(timer); token = ""; expiresAt = 0; status = "已清除本頁 Google 授權；目前資料未更新"; error = ""; emit(); }
    function start() { if (validToken()) return sync(); emit(); return false; }
    return { authorize, sync, start, beginManual, endManual, disconnect };
  }
  const api = { CONFIG, parseSheetData, serialDate, createController };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else host.MESGoogleSheets = api;
})(typeof window !== "undefined" ? window : globalThis);
