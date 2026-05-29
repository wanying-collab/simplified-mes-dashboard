export type MachineMasterItem = {
  masterKey: string;
  machineId: string;
  machineName: string;
  category: string;
  createdAt?: string | null;
  lastSeenAt?: string | null;
};

export type MachineUsageInput = {
  machineKey: string;
  machineId: string;
  machineName: string;
  processingMs: number;
  waitingMs: number;
  segmentCount: number;
  completedOrderCount: number;
};

export type MachineUsageRow = {
  masterKey: string;
  machineId: string;
  machineName: string;
  category: string;
  totalProcessingMs: number;
  totalWaitingMs: number;
  usageRate: number;
  completedOrderCount: number;
  segmentCount: number;
};

export function mergeMachineMaster(existing: MachineMasterItem[], current: Array<Pick<MachineMasterItem, "machineId" | "machineName">>): MachineMasterItem[] {
  const groups = new Map<string, MachineMasterItem>();

  (existing || []).forEach((item) => {
    const key = resolveMachineMasterKey(item.machineId, item.machineName);
    if (!key) return;
    groups.set(key, { ...item, masterKey: key });
  });

  (current || []).forEach((item) => {
    const key = resolveMachineMasterKey(item.machineId, item.machineName);
    if (!key) return;
    const prev = groups.get(key);
    groups.set(key, {
      masterKey: key,
      machineId: item.machineId || prev?.machineId || "",
      machineName: item.machineName || prev?.machineName || "",
      category: classifyMachineCategory(item.machineId, item.machineName),
      createdAt: prev?.createdAt || new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    });
  });

  return Array.from(groups.values()).sort((a, b) => `${a.machineId} ${a.machineName}`.localeCompare(`${b.machineId} ${b.machineName}`, "zh-Hant"));
}

export function calculateMachineUsageRows(master: MachineMasterItem[], usageInputs: MachineUsageInput[]): MachineUsageRow[] {
  const totalProcessingMs = (usageInputs || []).reduce((sum, item) => sum + clampDuration(item.processingMs), 0);
  const masterMap = new Map<string, MachineUsageRow>();

  (master || []).forEach((item) => {
    masterMap.set(item.masterKey, {
      masterKey: item.masterKey,
      machineId: item.machineId,
      machineName: item.machineName,
      category: item.category || classifyMachineCategory(item.machineId, item.machineName),
      totalProcessingMs: 0,
      totalWaitingMs: 0,
      usageRate: 0,
      completedOrderCount: 0,
      segmentCount: 0,
    });
  });

  (usageInputs || []).forEach((item) => {
    if (!masterMap.has(item.machineKey)) {
      masterMap.set(item.machineKey, {
        masterKey: item.machineKey,
        machineId: item.machineId,
        machineName: item.machineName,
        category: classifyMachineCategory(item.machineId, item.machineName),
        totalProcessingMs: 0,
        totalWaitingMs: 0,
        usageRate: 0,
        completedOrderCount: 0,
        segmentCount: 0,
      });
    }

    const target = masterMap.get(item.machineKey)!;
    target.totalProcessingMs += clampDuration(item.processingMs);
    target.totalWaitingMs += clampDuration(item.waitingMs);
    target.completedOrderCount += Math.max(item.completedOrderCount || 0, 0);
    target.segmentCount += Math.max(item.segmentCount || 0, 0);
  });

  return Array.from(masterMap.values())
    .map((item) => ({
      ...item,
      usageRate: totalProcessingMs > 0 ? item.totalProcessingMs / totalProcessingMs : 0,
    }))
    .sort((a, b) => b.totalProcessingMs - a.totalProcessingMs || `${a.machineId} ${a.machineName}`.localeCompare(`${b.machineId} ${b.machineName}`, "zh-Hant"));
}

export function classifyMachineCategory(machineId?: string, machineName?: string): string {
  const text = `${machineId || ""} ${machineName || ""}`
    .trim()
    .replace(/铣/g, "銑")
    .replace(/龍門铣/g, "龍門銑");

  if (!text) return "其他設備";
  if (text.includes("CNC")) return "CNC";
  if (text.includes("鑽床")) return "鑽床";
  if (text.includes("傳統車床") || /^L\d+/i.test(machineId || "") || (text.includes("車床") && !text.includes("CNC"))) return "傳統車床";
  if (text.includes("銑床") || text.includes("龍門銑") || text.includes("铣床") || text.includes("铣")) return "傳統銑床";
  return "其他設備";
}

function resolveMachineMasterKey(machineId?: string, machineName?: string): string {
  return String(machineId || "").trim() || String(machineName || "").trim();
}

function clampDuration(value: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}
