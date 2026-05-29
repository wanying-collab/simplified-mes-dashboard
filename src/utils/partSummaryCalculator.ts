export type PartSummaryOrder = {
  completed?: boolean;
  hasAnomaly?: boolean;
  quantity?: string | number;
  requiredItem?: string;
  parentItemNo?: string;
  productSpec?: string;
  normalizedProductSpec?: string;
  machineRoute?: string[];
  totalProcessingMs?: number;
  totalWaitingMs?: number;
  leadTimeMs?: number;
};

export type PartSummaryRow = {
  partNo: string;
  productSpec: string;
  totalQuantity: number;
  occurrenceCount: number;
  totalProcessingMs: number;
  totalWaitingMs: number;
  averageProcessingMs: number;
  averageWaitingMs: number;
  minProcessingMs: number;
  maxProcessingMs: number;
  machineCount: number;
  machineList: string;
  averageLeadTimeMs: number;
};

export function groupByPartNo(order: PartSummaryOrder): string {
  return clean(order.requiredItem) || clean(order.parentItemNo) || clean(order.normalizedProductSpec) || clean(order.productSpec);
}

export function calculatePartSummary(workOrders: PartSummaryOrder[]): PartSummaryRow[] {
  const groups = new Map<
    string,
    {
      partNo: string;
      productSpec: string;
      totalQuantity: number;
      occurrenceCount: number;
      totalProcessingMs: number;
      totalWaitingMs: number;
      minProcessingMs: number;
      maxProcessingMs: number;
      leadTimes: number[];
      machineSet: Set<string>;
    }
  >();

  (workOrders || [])
    .filter((order) => order.completed && !order.hasAnomaly && clamp(order.totalProcessingMs) > 0)
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
          machineSet: new Set<string>(),
        });
      }

      const target = groups.get(key)!;
      target.occurrenceCount += 1;
      target.totalProcessingMs += clamp(order.totalProcessingMs);
      target.totalWaitingMs += clamp(order.totalWaitingMs);
      target.minProcessingMs = Math.min(target.minProcessingMs, clamp(order.totalProcessingMs));
      target.maxProcessingMs = Math.max(target.maxProcessingMs, clamp(order.totalProcessingMs));
      target.leadTimes.push(clamp(order.leadTimeMs));

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
      averageLeadTimeMs: item.leadTimes.length
        ? Math.round(item.leadTimes.reduce((sum, value) => sum + value, 0) / item.leadTimes.length)
        : 0,
    }))
    .sort((a, b) => b.totalProcessingMs - a.totalProcessingMs || a.partNo.localeCompare(b.partNo));
}

export function exportPartSummaryExcel(workOrders: PartSummaryOrder[]): PartSummaryRow[] {
  return calculatePartSummary(workOrders);
}

function clean(value?: string): string {
  return String(value || "").trim();
}

function clamp(value?: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}
