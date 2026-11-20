import { addDaysISO, formatClock, manilaTime } from './time.ts'
import { serviceById } from './services.ts'

export interface Dentist {
  id: 'general-1' | 'general-2' | 'ortho'
  role: string
  /** 0 = Sunday ... 6 = Saturday. */
  weekdays: number[]
}

export const DENTISTS: Dentist[] = [
  { id: 'general-1', role: 'General dentist, chair 1', weekdays: [1, 2, 3, 4, 5, 6] },
  { id: 'general-2', role: 'General dentist, chair 2', weekdays: [1, 2, 3, 4, 5, 6] },
  { id: 'ortho', role: 'Orthodontist, chair 3', weekdays: [6] },
]

/** General treatments book any general dentist: a time is free when either general chair is, and goes to the first free one. */
export const ANY_GENERAL = 'general-any'
const GENERAL_CHAIRS = DENTISTS.filter((d) => d.id !== 'ortho').map((d) => d.id)

/** Clinic day in minutes since midnight, Cebu time. */
export const OPEN = 540
export const CLOSE = 1080
export const LUNCH_START = 720
export const LUNCH_END = 780
const STEP = 30
/** The last half-hour that can still start today. */
const LAST_START = CLOSE - STEP
/** Share of half-hours already booked in the sample diary (deterministic, so every visitor sees the same diary). */
const TAKEN_PERCENT = 30

export interface Slot {
  start: number
  available: boolean
  /** True when the slot is unavailable because the visitor already booked that chair at that time. */
  yours?: true
}

/** A stretch of one chair's day the visitor has already booked: minutes after midnight, Cebu time. */
export interface Busy {
  day: string
  dentistId: string
  start: number
  minutes: number
}

/** The weekday column (1 = Monday ... 6 = Saturday) of a clinic day in the booking's day grid; Sundays have none. */
export function weekdayColumn(isoDate: string): number | undefined {
  const weekday = weekdayOf(isoDate)
  return weekday === 0 ? undefined : weekday
}

/** "9:00 AM to 6:00 PM", as the pages write it; tests/hours.test.ts fails if a page disagrees. */
export const hoursText = (): string => `${formatClock(OPEN)} to ${formatClock(CLOSE)}`

/** The lunch hour as the pages write it: "12:00 to 1:00 PM" (the shared PM is said once). */
export function lunchText(): string {
  const start = formatClock(LUNCH_START)
  const end = formatClock(LUNCH_END)
  return `${start.endsWith(end.slice(-2)) ? start.slice(0, -3) : start} to ${end}`
}

const weekdayOf = (isoDate: string) => new Date(`${isoDate}T00:00:00Z`).getUTCDay()

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Today at the clinic, for the phone menu: "Today, Saturday", the hours, and one line about the day. */
export interface ClinicDay {
  label: string
  hours: string
  note: string
}

/** Today's hours in Cebu time: closed on Sundays, the orthodontist in on their days, otherwise the lunch hour. */
export function clinicDay(at: Date): ClinicDay {
  const { weekday } = manilaTime(at)
  const label = `Today, ${WEEKDAY_NAMES[weekday]}`
  if (weekday === 0) return { label, hours: 'Closed', note: `Open again Monday at ${formatClock(OPEN)}.` }
  const ortho = DENTISTS.some((d) => d.id === 'ortho' && d.weekdays.includes(weekday))
  return {
    label,
    hours: hoursText(),
    note: ortho ? 'The orthodontist is in today.' : `No appointments from ${formatClock(LUNCH_START)} to ${formatClock(LUNCH_END)}.`,
  }
}

/** Bookable clinic days in Manila, Sundays skipped. Today counts while a half-hour is still ahead. */
export function bookableDays(at: Date, count: number): string[] {
  const now = manilaTime(at)
  const days: string[] = []
  let day = now.minutes < LAST_START ? now.isoDate : addDaysISO(now.isoDate, 1)
  while (days.length < count) {
    if (weekdayOf(day) !== 0) days.push(day)
    day = addDaysISO(day, 1)
  }
  return days
}

export function dentistDays(at: Date, dentistId: string, count: number): string[] {
  const dentist = DENTISTS.find((d) => d.id === (dentistId === ANY_GENERAL ? GENERAL_CHAIRS[0] : dentistId))
  if (!dentist || count <= 0) return []
  const perWeek = dentist.weekdays.length
  return bookableDays(at, Math.ceil((count / perWeek) * 6) + 6)
    .filter((day) => dentist.weekdays.includes(weekdayOf(day)))
    .slice(0, count)
}

/** Braces are with the orthodontist; everything else is with either general dentist. */
export function dentistsFor(serviceId: string): Dentist[] {
  const ortho = serviceById(serviceId)?.ortho === true
  return DENTISTS.filter((d) => (d.id === 'ortho') === ortho)
}

/** Only braces ask which dentist. */
export function asksForDentist(serviceId: string): boolean {
  if (!serviceById(serviceId)) return true
  return serviceById(serviceId)?.ortho === true
}

/**
 * 30-minute starts from 9:00 AM that skip lunch, end by 6:00 PM, haven't passed (Manila time) and are free in the
 * sample diary and in `mine`; [] when the dentist doesn't work that day.
 */
export function timeSlots(isoDate: string, dentist: string, minutes: number, at: Date, mine: Busy[] = []): Slot[] {
  if (dentist === ANY_GENERAL) return anyGeneralSlots(isoDate, minutes, at, mine)
  const who = DENTISTS.find((d) => d.id === dentist)
  if (!who || !who.weekdays.includes(weekdayOf(isoDate)) || !(minutes > 0)) return []
  const now = manilaTime(at)
  const slots: Slot[] = []
  for (let start = OPEN; start + minutes <= CLOSE; start += STEP) {
    if (start < LUNCH_END && start + minutes > LUNCH_START) continue
    const past = isoDate < now.isoDate || (isoDate === now.isoDate && start <= now.minutes)
    const yours = mine.some((b) => b.day === isoDate && b.dentistId === dentist && start < b.start + b.minutes && start + minutes > b.start)
    slots.push({ start, available: !past && !yours && halfHoursFree(isoDate, dentist, start, minutes), ...(yours ? { yours } : {}) })
  }
  return slots
}

/** A slot of "any general dentist" is free when some general chair is free; if none is, it is "yours" when your own booking is why. */
function anyGeneralSlots(isoDate: string, minutes: number, at: Date, mine: Busy[]): Slot[] {
  const chairs = GENERAL_CHAIRS.map((id) => timeSlots(isoDate, id, minutes, at, mine))
  return (chairs[0] ?? []).map((slot, i) => {
    const same = chairs.map((list) => list[i])
    const available = same.some((s) => s.available)
    const yours = !available && same.some((s) => s.yours)
    return { start: slot.start, available, ...(yours ? { yours: true as const } : {}) }
  })
}

/** The chair a booking at this time goes to: the named one when it is free, or for "any general dentist" the first general chair that is. */
export function chairFor(isoDate: string, dentist: string, start: number, minutes: number, at: Date, mine: Busy[] = []): string | undefined {
  const candidates = dentist === ANY_GENERAL ? GENERAL_CHAIRS : [dentist]
  return candidates.find((id) => timeSlots(isoDate, id, minutes, at, mine).some((s) => s.start === start && s.available))
}

function halfHoursFree(isoDate: string, dentist: string, start: number, minutes: number): boolean {
  for (let block = start; block < start + minutes; block += STEP) {
    if (fnv1a(`${isoDate}|${dentist}|${block}`) % 100 < TAKEN_PERCENT) return false
  }
  return true
}

function fnv1a(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export interface PatientErrors {
  name?: string
  hmo?: string
}

/** Field errors for the details step. The name is 2 to 60 characters after trimming; the HMO is optional, up to 40. */
export function validatePatient(input: { name: string; hmo: string }): PatientErrors {
  const errors: PatientErrors = {}
  const nameLength = Array.from(input.name.trim()).length
  if (nameLength === 0) errors.name = 'Enter the patient’s name.'
  else if (nameLength < 2) errors.name = 'Enter at least 2 characters.'
  else if (nameLength > 60) errors.name = 'Keep the name to 60 characters or fewer.'
  if (Array.from(input.hmo.trim()).length > 40) errors.hmo = 'Keep the HMO name to 40 characters or fewer.'
  return errors
}

/** The same day six months later, or the last day of that month when it is shorter. */
export function sixMonthsAfter(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, month + 6, 0)).getUTCDate()
  return new Date(Date.UTC(year, month + 5, Math.min(day, lastDay))).toISOString().slice(0, 10)
}

export function reminderMessage(firstName: string): string {
  return `Hi ${firstName}, it’s been six months since your visit to Enamel in Guadalupe. Your next check-up and cleaning is due, and you can book it any time.`
}
