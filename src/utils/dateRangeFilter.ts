export type DateRange = {
  label: string;
  start: Date | null;
  end: Date | null;
};

export type DatedRecord = {
  recordedAt?: Date | null;
};

export function filterByDateRange<T extends DatedRecord>(records: T[], range: DateRange): T[] {
  if (!range.start && !range.end) {
    return [...records];
  }
  return records.filter((record) => {
    if (!(record.recordedAt instanceof Date) || Number.isNaN(record.recordedAt.getTime())) {
      return false;
    }
    const time = record.recordedAt.getTime();
    return (!range.start || time >= range.start.getTime()) && (!range.end || time <= range.end.getTime());
  });
}

export function getYesterdayRange(now = new Date()): DateRange {
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  return { label: "昨天", start: startOfDay(target), end: endOfDay(target) };
}

export function getTodayRange(now = new Date()): DateRange {
  return { label: "今天", start: startOfDay(now), end: endOfDay(now) };
}

export function getWeekRange(now = new Date()): DateRange {
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  return { label: "本週", start: startOfDay(monday), end: endOfDay(sunday) };
}

export function getMonthRange(now = new Date()): DateRange {
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { label: "本月", start: startOfDay(firstDay), end: endOfDay(lastDay) };
}

export function getHalfYearRange(whichHalf: "first" | "second", now = new Date()): DateRange {
  const year = now.getFullYear();
  return whichHalf === "first"
    ? { label: "上半年", start: new Date(year, 0, 1, 0, 0, 0), end: new Date(year, 5, 30, 23, 59, 59, 999) }
    : { label: "下半年", start: new Date(year, 6, 1, 0, 0, 0), end: new Date(year, 11, 31, 23, 59, 59, 999) };
}

export function getFullRange(): DateRange {
  return { label: "全部", start: null, end: null };
}

export function getCustomRange(startDate: string, endDate: string): DateRange {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  return { label: "自訂日期", start: startOfDay(start), end: endOfDay(end) };
}

function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}
