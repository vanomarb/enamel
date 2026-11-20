/** Clinic time. Every "now" on the site is read in Cebu (Asia/Manila), whatever the visitor's own time zone. */
export interface ManilaTime {
  /** Calendar date in Manila, YYYY-MM-DD. */
  isoDate: string
  /** 0 = Sunday ... 6 = Saturday. */
  weekday: number
  /** Minutes since midnight in Manila. */
  minutes: number
}

const manilaParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function manilaTime(at: Date): ManilaTime {
  const part: Record<string, string> = {}
  for (const { type, value } of manilaParts.formatToParts(at)) part[type] = value
  return {
    isoDate: `${part.year}-${part.month}-${part.day}`,
    weekday: WEEKDAYS.indexOf(part.weekday),
    minutes: Number(part.hour) * 60 + Number(part.minute),
  }
}

/** Adds whole days to a YYYY-MM-DD date. Works on the calendar date only, so time zones can't shift it. */
export function addDaysISO(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

/** Minutes since midnight as a 12-hour clock time, e.g. 465 → "7:45 AM". Values past midnight wrap. */
export function formatClock(minutes: number): string {
  const inDay = ((minutes % 1440) + 1440) % 1440
  const hours = Math.floor(inDay / 60)
  const mins = inDay % 60
  return `${hours % 12 || 12}:${String(mins).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`
}

/** True for a YYYY-MM-DD that is a day on the calendar: "2026-02-30" and "2026-13-45" are not. */
export function isRealDate(isoDate: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(isoDate) && addDaysISO(isoDate, 0) === isoDate
}
