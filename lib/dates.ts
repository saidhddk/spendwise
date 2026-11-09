// Dates are calendar days in Africa/Tunis time (FR-12).

const tunisDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Tunis",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function todayTunis(now = new Date()): string {
  return tunisDay.format(now); // YYYY-MM-DD
}

export function currentMonthTunis(now = new Date()): string {
  return todayTunis(now).slice(0, 7);
}

export function isRealDate(value: string): boolean {
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Inclusive string bounds for one month; dates are stored as YYYY-MM-DD. */
export function monthBounds(month: string): { gte: string; lte: string } {
  return { gte: `${month}-01`, lte: `${month}-31` };
}

export function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}
