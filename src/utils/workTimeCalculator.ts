export type MesRecord = {
  workOrderNo?: string;
  machineId?: string;
  machineName?: string;
  actionStatus?: "Start" | "Resume" | "Pause" | "End" | string;
  recordedAt?: Date | null;
  currentWorkHours?: number;
  totalWorkHours?: number;
};

export type MachineWorkSummary = {
  machineKey: string;
  machineId: string;
  machineName: string;
  processingMs: number;
  segmentCount: number;
};

export type StationTransition = {
  fromStation: string;
  toStation: string;
  fromEndTime: Date | null;
  toStartTime: Date | null;
  waitingMs: number;
};

export type WorkOrderFlow = {
  machineSummary: MachineWorkSummary[];
  stationTransitions: StationTransition[];
  totalProcessingMs: number;
  totalWaitingMs: number;
  leadTimeMs: number;
};

export type WorkOrderSummaryLike = {
  completed?: boolean;
  hasAnomaly?: boolean;
  machineWorkSummary?: MachineWorkSummary[];
};

export type MachineAverageHours = Map<string, { averageProcessingMs: number; sampleCount: number }>;

export type MachineUtilizationConfig = {
  dailyAvailableHours?: number;
  dayCount?: number;
};

const FIXED_BREAK_WINDOWS = [
  { startHour: 10, startMinute: 0, endHour: 10, endMinute: 15 },
  { startHour: 12, startMinute: 0, endHour: 13, endMinute: 0 },
  { startHour: 15, startMinute: 0, endHour: 15, endMinute: 15 },
] as const;

export function calculateMachineWorkHours(records: MesRecord[]): MachineWorkSummary[] {
  const machineMap = new Map<string, MachineWorkSummary>();
  const sorted = [...records].sort(compareRecordTime);
  let currentStart: MesRecord | null = null;

  sorted.forEach((record) => {
    const status = record.actionStatus || "";
    if (status === "Start" || status === "Resume") {
      currentStart = record;
      return;
    }

    if ((status === "Pause" || status === "End") && currentStart) {
      const machineKey = getMachineKey(currentStart.machineId, currentStart.machineName);
      if (!machineKey) {
        currentStart = null;
        return;
      }
      const durationMs = resolveSegmentDuration(currentStart, record);
      if (!machineMap.has(machineKey)) {
        machineMap.set(machineKey, {
          machineKey,
          machineId: currentStart.machineId || "",
          machineName: currentStart.machineName || "",
          processingMs: 0,
          segmentCount: 0,
        });
      }
      const target = machineMap.get(machineKey)!;
      target.processingMs += durationMs;
      target.segmentCount += 1;
      currentStart = null;
    }
  });

  return Array.from(machineMap.values());
}

export function calculateStationWaitingHours(transitions: StationTransition[]): StationTransition[] {
  return (transitions || []).filter((item) => item.fromStation !== item.toStation && item.waitingMs > 0);
}

export function calculateTotalWaitingHours(transitions: StationTransition[]): number {
  return calculateStationWaitingHours(transitions).reduce((sum, item) => sum + clampDuration(item.waitingMs), 0);
}

export function calculateMachineAverageHours(workOrders: WorkOrderSummaryLike[]): MachineAverageHours {
  const groups = new Map<string, number[]>();

  (workOrders || [])
    .filter((order) => order.completed && !order.hasAnomaly)
    .forEach((order) => {
      (order.machineWorkSummary || []).forEach((machine) => {
        if (!machine.machineKey || !clampDuration(machine.processingMs)) {
          return;
        }
        if (!groups.has(machine.machineKey)) {
          groups.set(machine.machineKey, []);
        }
        groups.get(machine.machineKey)!.push(clampDuration(machine.processingMs));
      });
    });

  const result: MachineAverageHours = new Map();
  groups.forEach((values, key) => {
    result.set(key, {
      averageProcessingMs: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
      sampleCount: values.length,
    });
  });
  return result;
}

export function calculateLeadTime(totalProcessingMs: number, totalWaitingMs: number): number {
  return clampDuration(totalProcessingMs) + clampDuration(totalWaitingMs);
}

export function calculateMachineUtilization(
  processingMs: number,
  config: MachineUtilizationConfig = {}
): { processingMs: number; availableMs: number; utilizationRate: number } {
  const dayCount = Number.isFinite(config.dayCount) && (config.dayCount || 0) > 0 ? Number(config.dayCount) : 0;
  const dailyHours =
    Number.isFinite(config.dailyAvailableHours) && (config.dailyAvailableHours || 0) > 0
      ? Number(config.dailyAvailableHours)
      : 8;
  const availableMs = dayCount * dailyHours * 60 * 60 * 1000;
  const safeProcessingMs = clampDuration(processingMs);

  return {
    processingMs: safeProcessingMs,
    availableMs,
    utilizationRate: availableMs > 0 ? safeProcessingMs / availableMs : 0,
  };
}

function resolveSegmentDuration(startRecord: MesRecord, endRecord: MesRecord): number {
  if (startRecord.recordedAt instanceof Date && endRecord.recordedAt instanceof Date) {
    return calculateBreakDeductedWorkHours(startRecord.recordedAt, endRecord.recordedAt);
  }
  if (clampDuration(endRecord.currentWorkHours)) {
    return clampDuration(endRecord.currentWorkHours);
  }
  return 0;
}

export function calculateBreakDeductedWorkHours(startAt: Date, endAt: Date): number {
  if (!(startAt instanceof Date) || !(endAt instanceof Date)) {
    return 0;
  }

  const rawMs = endAt.getTime() - startAt.getTime();
  if (!Number.isFinite(rawMs) || rawMs <= 0) {
    return 0;
  }

  let deductedMs = 0;
  let cursor = new Date(startAt.getFullYear(), startAt.getMonth(), startAt.getDate(), 0, 0, 0, 0);

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

    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1, 0, 0, 0, 0);
  }

  return Math.max(rawMs - deductedMs, 0);
}

function compareRecordTime(a: MesRecord, b: MesRecord): number {
  const aTime = a.recordedAt instanceof Date ? a.recordedAt.getTime() : Number.MAX_SAFE_INTEGER;
  const bTime = b.recordedAt instanceof Date ? b.recordedAt.getTime() : Number.MAX_SAFE_INTEGER;
  return aTime - bTime;
}

function getMachineKey(machineId?: string, machineName?: string): string {
  const id = String(machineId || "").trim();
  const name = String(machineName || "").trim();
  if (id && name) {
    return `${id}__${name}`;
  }
  return id || name;
}

function clampDuration(value: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}
