export type StationDetail = {
  stationNo: number;
  machineId?: string;
  machineName?: string;
  processingMs?: number;
  waitingAfterMs?: number;
  startAt?: Date | null;
  endAt?: Date | null;
};

export type StationWaitingDetail = {
  fromStation: string;
  toStation: string;
  fromEndTime: Date | null;
  toStartTime: Date | null;
  waitingMs: number;
};

export function calculateStationWaitingTimes(stations: StationDetail[]): number[] {
  return stations.map((station) => Math.max(station.waitingAfterMs || 0, 0));
}

export function calculateTotalWaitingTime(stations: StationDetail[]): number {
  return calculateStationWaitingTimes(stations).reduce((sum, value) => sum + value, 0);
}

export function calculateCrossStationWaiting(fromPauseAt: Date | null, toResumeAt: Date | null): number {
  if (!(fromPauseAt instanceof Date) || !(toResumeAt instanceof Date)) {
    return 0;
  }
  return Math.max(toResumeAt.getTime() - fromPauseAt.getTime(), 0);
}

export function calculateStationWaitingDetails(
  stations: StationDetail[],
  getStationName: (station: StationDetail) => string = (station) => station.machineName || station.machineId || "未填機台"
): StationWaitingDetail[] {
  const details: StationWaitingDetail[] = [];

  for (let index = 0; index < (stations || []).length - 1; index += 1) {
    const fromStation = stations[index];
    const toStation = stations[index + 1];
    const fromKey = String(fromStation.machineId || fromStation.machineName || "").trim();
    const toKey = String(toStation.machineId || toStation.machineName || "").trim();

    if (!fromKey || !toKey || fromKey === toKey) {
      continue;
    }

    const waitingMs = calculateCrossStationWaiting(fromStation.endAt || null, toStation.startAt || null);
    if (waitingMs <= 0) {
      continue;
    }

    details.push({
      fromStation: getStationName(fromStation),
      toStation: getStationName(toStation),
      fromEndTime: fromStation.endAt || null,
      toStartTime: toStation.startAt || null,
      waitingMs,
    });
  }

  return details;
}

export function calculateStationProcessingTimes(stations: StationDetail[]): number[] {
  return stations.map((station) => Math.max(station.processingMs || 0, 0));
}

export function calculateStationUtilization(stations: StationDetail[]): Array<number | null> {
  return stations.map((station) => {
    const processingMs = Math.max(station.processingMs || 0, 0);
    const waitingMs = Math.max(station.waitingAfterMs || 0, 0);
    const baseMs = processingMs + waitingMs;
    return baseMs > 0 ? processingMs / baseMs : null;
  });
}
