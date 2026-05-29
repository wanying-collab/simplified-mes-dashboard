export type HolidayRecord = {
  actionStatus?: string;
  recordedAt?: Date | null;
};

export type WorkingDayWindow = {
  dateKey: string;
  holiday: boolean;
  keepWithoutHoliday: boolean;
  overlapMs: number;
  availableMs: number;
};

export const DEFAULT_BREAK_MS = 60 * 60 * 1000;

export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function isHoliday(date: Date, holidaySet: Set<string> = new Set()): boolean {
  return isWeekend(date) || holidaySet.has(formatDateInput(date));
}

export function hasWorkOnHoliday(records: HolidayRecord[], targetDate: Date): boolean {
  const targetKey = formatDateInput(targetDate);
  return records.some((record) => {
    if (!(record.recordedAt instanceof Date) || Number.isNaN(record.recordedAt.getTime())) {
      return false;
    }
    return formatDateInput(record.recordedAt) === targetKey && ["Start", "Resume", "End"].includes(record.actionStatus || "");
  });
}

export function getWorkingDays(
  startAt: Date,
  endAt: Date,
  records: HolidayRecord[],
  options?: { breakMs?: number; holidaySet?: Set<string> }
): WorkingDayWindow[] {
  const breakMs = options?.breakMs ?? DEFAULT_BREAK_MS;
  const holidaySet = options?.holidaySet ?? new Set<string>();
  const days: WorkingDayWindow[] = [];
  let cursor = startOfDay(startAt);

  while (cursor.getTime() <= endAt.getTime()) {
    const dayStart = cursor;
    const dayEnd = endOfDay(cursor);
    const overlapStart = new Date(Math.max(startAt.getTime(), dayStart.getTime()));
    const overlapEnd = new Date(Math.min(endAt.getTime(), dayEnd.getTime()));
    const overlapMs = Math.max(overlapEnd.getTime() - overlapStart.getTime(), 0);

    if (overlapMs > 0) {
      const holiday = isHoliday(dayStart, holidaySet);
      const keepWithoutHoliday = !holiday || hasWorkOnHoliday(records, dayStart);
      days.push({
        dateKey: formatDateInput(dayStart),
        holiday,
        keepWithoutHoliday,
        overlapMs,
        availableMs: Math.max(overlapMs - breakMs, 0),
      });
    }

    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
  }

  return days;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function formatDateInput(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
