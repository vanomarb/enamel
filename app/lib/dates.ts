/* Clinic days are formatted in UTC from the YYYY-MM-DD string alone, so the visitor's time zone can't move a day. */

const utc = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' })
const long = utc({ weekday: 'long', month: 'long', day: 'numeric' })
const longYear = utc({ weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
const weekday = utc({ weekday: 'short' })
const shortDay = utc({ month: 'short', day: 'numeric' })

const asDate = (isoDate: string) => new Date(`${isoDate}T00:00:00Z`)

export type DateStyle = 'long' | 'long-year' | 'weekday' | 'month-day'

const FORMATS: Record<DateStyle, Intl.DateTimeFormat> = { long, 'long-year': longYear, weekday, 'month-day': shortDay }

/** 'long' is "Friday, November 20", 'long-year' adds the year, 'weekday' is "Fri", 'month-day' is "Nov 20". */
export function formatDay(isoDate: string, style: DateStyle = 'long'): string {
  return FORMATS[style].format(asDate(isoDate))
}
