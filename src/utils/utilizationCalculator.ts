import { getWorkingDays, type HolidayRecord } from "./holidayCalculator";
import type { DateRange } from "./dateRangeFilter";

export type MachineUtilizationInput = {
  machineId: string;
  machineName?: string;
  records: HolidayRecord[];
  range: DateRange;
  processingHoursMs: number;
  waitingHoursMs?: number;
  dailyAvailableHours?: number;
  excludeHolidays?: boolean;
};

export type MachineUtilizationResult = {
  machineId: string;
  machineName: string;
  totalHours: number;
  availableHours: number;
  availableHoursWithHoliday: number;
  availableHoursWithoutHoliday: number;
  processingHours: number;
  waitingHours: number;
  utilizationRate: number;
  utilizationWithHoliday: number;
  utilizationWithoutHoliday: number;
};

const DEFAULT_DAILY_AVAILABLE_HOURS = 8;

export function calculateMachineUtilization(input: MachineUtilizationInput): MachineUtilizationResult {
  const range = materializeRange(input.range, input.records);
  const processingHours = clampDuration(input.processingHoursMs);
  const waitingHours = clampDuration(input.waitingHoursMs ?? 0);
  const dailyHours = Number.isFinite(input.dailyAvailableHours) && (input.dailyAvailableHours || 0) > 0
    ? Number(input.dailyAvailableHours)
    : DEFAULT_DAILY_AVAILABLE_HOURS;
  const dailyAvailableMs = dailyHours * 60 * 60 * 1000;

  const result: MachineUtilizationResult = {
    machineId: input.machineId || "",
    machineName: input.machineName || "",
    totalHours: 0,
    availableHours: 0,
    availableHoursWithHoliday: 0,
    availableHoursWithoutHoliday: 0,
    processingHours,
    waitingHours,
    utilizationRate: 0,
    utilizationWithHoliday: 0,
    utilizationWithoutHoliday: 0,
  };

  if (!(range.start instanceof Date) || !(range.end instanceof Date) || range.end.getTime() < range.start.getTime()) {
    return result;
  }

  const dayWindows = getWorkingDays(range.start, range.end, input.records || [], { breakMs: 0 });
  const availableHoursWithHoliday = dayWindows.reduce((sum, item) => sum + (item.overlapMs > 0 ? dailyAvailableMs : 0), 0);
  const availableHoursWithoutHoliday = dayWindows.reduce(
    (sum, item) => sum + (item.overlapMs > 0 && item.keepWithoutHoliday ? dailyAvailableMs : 0),
    0
  );
  const availableHours = input.excludeHolidays ? availableHoursWithoutHoliday : availableHoursWithHoliday;

  result.totalHours = Math.max(range.end.getTime() - range.start.getTime(), 0);
  result.availableHours = availableHours;
  result.availableHoursWithHoliday = availableHoursWithHoliday;
  result.availableHoursWithoutHoliday = availableHoursWithoutHoliday;
  result.utilizationRate = ratio(processingHours, availableHours) ?? 0;
  result.utilizationWithHoliday = ratio(processingHours, availableHoursWithHoliday) ?? 0;
  result.utilizationWithoutHoliday = ratio(processingHours, availableHoursWithoutHoliday) ?? 0;

  return result;
}

function materializeRange(range: DateRange, records: HolidayRecord[]): DateRange {
  if (range?.start && range?.end) {
    return range;
  }

  const validTimes = (records || [])
    .map((record) => (record.recordedAt instanceof Date ? record.recordedAt.getTime() : NaN))
    .filter((value) => Number.isFinite(value));

  if (!validTimes.length) {
    return {
      label: range?.label || "全部",
      start: null,
      end: null,
    };
  }

  return {
    label: range?.label || "全部",
    start: startOfDay(new Date(Math.min(...validTimes))),
    end: endOfDay(new Date(Math.max(...validTimes))),
  };
}

function ratio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }
  return Math.max(Math.min(numerator / denominator, 1), 0);
}

function clampDuration(value: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}
