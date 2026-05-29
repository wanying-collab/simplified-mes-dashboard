export type OperatorStationRecord = {
  operator?: string;
  workOrderNo?: string;
  productSpec?: string;
  machineId?: string;
  machineName?: string;
  startAt?: Date | null;
  endAt?: Date | null;
  processingMs?: number;
};

export type OperatorSummary = {
  operator: string;
  totalProcessingMs: number;
  segmentCount: number;
  averageProcessingMs: number;
  workOrderCount: number;
  machineList: string[];
  productSpecs: string[];
  latestRecordAt: Date | null;
};

export type ProductOperatorAnalysis = {
  normalizedProductSpec: string;
  productSpec: string;
  orderCount: number;
  originalSpecs: string[];
  operators: Array<{
    operator: string;
    totalProcessingMs: number;
    segmentCount: number;
    averageProcessingMs: number;
    workOrderCount: number;
    machineList: string[];
  }>;
};

export type WorkOrderOperatorAnalysis = {
  operator: string;
  totalProcessingMs: number;
  segmentCount: number;
  averageProcessingMs: number;
  machineList: string[];
  validWorkTime: boolean;
  hasAnomaly: boolean;
  noteText: string;
};

export function calculateOperatorSummary(records: OperatorStationRecord[]): OperatorSummary[] {
  const groups = new Map<
    string,
    {
      totalProcessingMs: number;
      segmentCount: number;
      workOrders: Set<string>;
      machines: Set<string>;
      productSpecs: Set<string>;
      latestRecordAt: Date | null;
    }
  >();

  (records || []).forEach((record) => {
    const operator = String(record.operator || "").trim();
    const processingMs = clampDuration(record.processingMs || 0);
    if (!operator || processingMs <= 0) {
      return;
    }

    if (!groups.has(operator)) {
      groups.set(operator, {
        totalProcessingMs: 0,
        segmentCount: 0,
        workOrders: new Set(),
        machines: new Set(),
        productSpecs: new Set(),
        latestRecordAt: null,
      });
    }

    const target = groups.get(operator)!;
    const machineLabel = [record.machineId, record.machineName].filter(Boolean).join(" ") || "未填機台";
    const latestCandidate = record.endAt instanceof Date ? record.endAt : record.startAt instanceof Date ? record.startAt : null;

    target.totalProcessingMs += processingMs;
    target.segmentCount += 1;
    if (record.workOrderNo) target.workOrders.add(record.workOrderNo);
    if (record.productSpec) target.productSpecs.add(record.productSpec);
    target.machines.add(machineLabel);
    if (latestCandidate && (!target.latestRecordAt || latestCandidate.getTime() > target.latestRecordAt.getTime())) {
      target.latestRecordAt = latestCandidate;
    }
  });

  return Array.from(groups.entries())
    .map(([operator, item]) => ({
      operator,
      totalProcessingMs: item.totalProcessingMs,
      segmentCount: item.segmentCount,
      averageProcessingMs: item.segmentCount ? Math.round(item.totalProcessingMs / item.segmentCount) : 0,
      workOrderCount: item.workOrders.size,
      machineList: Array.from(item.machines).sort(),
      productSpecs: Array.from(item.productSpecs).sort(),
      latestRecordAt: item.latestRecordAt,
    }))
    .sort((a, b) => b.totalProcessingMs - a.totalProcessingMs || a.operator.localeCompare(b.operator, "zh-Hant"));
}

export function calculateProductOperatorAnalysis(
  records: Array<OperatorStationRecord & { normalizedProductSpec?: string }>
): ProductOperatorAnalysis[] {
  const groups = new Map<
    string,
    {
      productSpec: string;
      originalSpecs: Set<string>;
      orderSet: Set<string>;
      operatorMap: Map<
        string,
        {
          totalProcessingMs: number;
          segmentCount: number;
          machineSet: Set<string>;
          workOrderSet: Set<string>;
        }
      >;
    }
  >();

  (records || []).forEach((record) => {
    const normalizedProductSpec = String(record.normalizedProductSpec || "").trim();
    const operator = String(record.operator || "").trim();
    const processingMs = clampDuration(record.processingMs || 0);
    if (!normalizedProductSpec || !operator || processingMs <= 0) {
      return;
    }

    if (!groups.has(normalizedProductSpec)) {
      groups.set(normalizedProductSpec, {
        productSpec: String(record.productSpec || normalizedProductSpec).trim(),
        originalSpecs: new Set(),
        orderSet: new Set(),
        operatorMap: new Map(),
      });
    }

    const target = groups.get(normalizedProductSpec)!;
    if (record.productSpec) target.originalSpecs.add(record.productSpec);
    if (record.workOrderNo) target.orderSet.add(record.workOrderNo);

    if (!target.operatorMap.has(operator)) {
      target.operatorMap.set(operator, {
        totalProcessingMs: 0,
        segmentCount: 0,
        machineSet: new Set(),
        workOrderSet: new Set(),
      });
    }

    const operatorTarget = target.operatorMap.get(operator)!;
    operatorTarget.totalProcessingMs += processingMs;
    operatorTarget.segmentCount += 1;
    if (record.workOrderNo) operatorTarget.workOrderSet.add(record.workOrderNo);
    operatorTarget.machineSet.add([record.machineId, record.machineName].filter(Boolean).join(" ") || "未填機台");
  });

  return Array.from(groups.entries())
    .map(([normalizedProductSpec, item]) => ({
      normalizedProductSpec,
      productSpec: item.productSpec,
      orderCount: item.orderSet.size,
      originalSpecs: Array.from(item.originalSpecs).sort(),
      operators: Array.from(item.operatorMap.entries())
        .map(([operator, detail]) => ({
          operator,
          totalProcessingMs: detail.totalProcessingMs,
          segmentCount: detail.segmentCount,
          averageProcessingMs: detail.segmentCount ? Math.round(detail.totalProcessingMs / detail.segmentCount) : 0,
          workOrderCount: detail.workOrderSet.size,
          machineList: Array.from(detail.machineSet).sort(),
        }))
        .sort((a, b) => b.totalProcessingMs - a.totalProcessingMs || a.operator.localeCompare(b.operator, "zh-Hant")),
    }))
    .sort((a, b) => b.orderCount - a.orderCount || a.productSpec.localeCompare(b.productSpec, "zh-Hant"));
}

export function calculateWorkOrderOperatorAnalysis(
  records: Array<OperatorStationRecord & { noteText?: string; anomaly?: boolean }>
): WorkOrderOperatorAnalysis[] {
  const groups = new Map<
    string,
    {
      totalProcessingMs: number;
      segmentCount: number;
      machineSet: Set<string>;
      validWorkTime: boolean;
      hasAnomaly: boolean;
      notes: Set<string>;
    }
  >();

  (records || []).forEach((record) => {
    const operator = String(record.operator || "").trim() || "未填操作員";
    const processingMs = clampDuration(record.processingMs || 0);
    const machineLabel = [record.machineId, record.machineName].filter(Boolean).join(" ") || "未填機台";

    if (!groups.has(operator)) {
      groups.set(operator, {
        totalProcessingMs: 0,
        segmentCount: 0,
        machineSet: new Set(),
        validWorkTime: false,
        hasAnomaly: false,
        notes: new Set(),
      });
    }

    const target = groups.get(operator)!;
    target.machineSet.add(machineLabel);
    target.totalProcessingMs += processingMs;
    target.segmentCount += processingMs > 0 ? 1 : 0;
    target.validWorkTime = target.validWorkTime || processingMs > 0;
    target.hasAnomaly = target.hasAnomaly || !!record.anomaly;
    if (record.noteText) {
      target.notes.add(record.noteText);
    }
  });

  return Array.from(groups.entries())
    .map(([operator, item]) => ({
      operator,
      totalProcessingMs: item.totalProcessingMs,
      segmentCount: item.segmentCount,
      averageProcessingMs: item.segmentCount ? Math.round(item.totalProcessingMs / item.segmentCount) : 0,
      machineList: Array.from(item.machineSet).sort(),
      validWorkTime: item.validWorkTime,
      hasAnomaly: item.hasAnomaly,
      noteText: Array.from(item.notes).join("；") || (item.validWorkTime ? "有效工時" : "不納入計算"),
    }))
    .sort((a, b) => b.totalProcessingMs - a.totalProcessingMs || a.operator.localeCompare(b.operator, "zh-Hant"));
}

function clampDuration(value: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}
