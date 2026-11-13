export function todayHK(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function monthStartHK(today = todayHK()): string {
  return `${today.slice(0, 8)}01`;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function dayCount(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

/** Calendar date in America/New_York for an instant. */
export function nyDate(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

function tzParts(timeZone: string, date: Date): { y: number; m: number; d: number; h: number; min: number; s: number } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const bag: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) bag[part.type] = part.value;
  let hour = Number(bag.hour);
  if (hour === 24) hour = 0;
  return {
    y: Number(bag.year),
    m: Number(bag.month),
    d: Number(bag.day),
    h: hour,
    min: Number(bag.minute),
    s: Number(bag.second),
  };
}

function zoneOffsetMs(timeZone: string, instant: Date): number {
  const p = tzParts(timeZone, instant);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
  return asUtc - instant.getTime();
}

/** Wall-clock time in a zone, returned as a Date instant. */
export function zonedWallTime(date: string, hour: number, minute: number, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const utcGuess = Date.UTC(y, m - 1, d, hour, minute, 0);
  let t = utcGuess;
  for (let i = 0; i < 3; i += 1) {
    t = utcGuess - zoneOffsetMs(timeZone, new Date(t));
  }
  return new Date(t);
}

/** 16:00 America/New_York on a session date, as ISO. */
export function usCloseIso(sessionDate: string): string {
  return zonedWallTime(sessionDate, 16, 0, "America/New_York").toISOString();
}

export function formatHK(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Hong_Kong",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return `${day} ${time}`;
}
