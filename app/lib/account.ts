import { bookingHref } from './book-link.ts'
import { DENTISTS, reminderMessage, sixMonthsAfter } from './booking.ts'
import { formatDay } from './dates.ts'
import { checklistFor, durationLabel, priceWithUnit, serviceById } from './services.ts'
import { formatClock, isRealDate } from './time.ts'

/** The part of Storage this module uses, so tests can pass a stand-in. */
export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** Every key the site writes starts with this, so removeEverything() finds them all. */
export const STORAGE_PREFIX = 'enamel.'
export const ACCOUNT_KEY = 'enamel.account'
export const APPOINTMENTS_KEY = 'enamel.appointments'

export type Contact = { kind: 'email' | 'mobile'; value: string }

export interface Session {
  firstName: string
  contact: Contact
}

export interface Appointment {
  id: string
  serviceId: string
  dentistId: string
  /** Calendar date in Cebu time, YYYY-MM-DD. */
  day: string
  /** Minutes after midnight, Cebu time. */
  start: number
  patient: string
  hmo: string
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export const isEmail = (text: string): boolean => EMAIL.test(text)

/** An email address, or a Philippine mobile number (09…, +63 9… or 63 9…, spaces and dashes allowed). */
export function parseContact(input: string): Contact | null {
  const text = input.trim()
  if (isEmail(text)) return { kind: 'email', value: text }
  const digits = text.replace(/[\s().-]/g, '')
  const mobile = digits.match(/^(?:\+?63|0)(9\d{9})$/)
  return mobile ? { kind: 'mobile', value: `0${mobile[1]}` } : null
}

/** "a••••@example.com" or "0917 ••• 4567": enough to recognise, without showing it all. */
export function maskContact(contact: Contact): string {
  if (contact.kind === 'mobile') return `${contact.value.slice(0, 4)} ••• ${contact.value.slice(-4)}`
  const [local, domain] = contact.value.split('@')
  return `${local.slice(0, 1)}${'•'.repeat(Math.max(local.length - 1, 1))}@${domain}`
}

/**
 * The name's first word, safe in a CSS string, at most 16 characters and never half an emoji.
 * components/header.html repeats this rule; tests/pages.test.ts checks the two agree.
 */
export function firstWord(name: string): string {
  return Array.from(name.trim().split(/\s+/)[0].replace(/["\\<>]/g, '')).slice(0, 16).join('')
}

export function validateFirstName(name: string): string | null {
  const text = name.trim()
  // A name with nothing left for the header to show would leave the header signed out and the session signed in.
  if (!firstWord(text)) return 'Enter your first name.'
  if (text.length > 40) return 'Use 40 characters or fewer.'
  return null
}

export function demoCode(random: () => number = Math.random): string {
  return String(1000 + Math.floor(random() * 9000))
}

export function codeMatches(entered: string, expected: string): boolean {
  const digits = entered.replace(/\s/g, '')
  return digits.length > 0 && digits === expected
}

function read(store: KeyValueStore | null, key: string): unknown {
  try {
    const text = store?.getItem(key)
    return text ? JSON.parse(text) : null
  } catch {
    return null
  }
}

function write(store: KeyValueStore | null, key: string, value: unknown): boolean {
  if (!store) return false
  try {
    store.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

function isSession(value: unknown): value is Session {
  const v = value as Session | null
  return (
    !!v &&
    typeof v.firstName === 'string' &&
    validateFirstName(v.firstName) === null &&
    !!v.contact &&
    (v.contact.kind === 'email' || v.contact.kind === 'mobile') &&
    typeof v.contact.value === 'string' &&
    parseContact(v.contact.value) !== null
  )
}

export function loadSession(store: KeyValueStore | null): Session | null {
  const value = read(store, ACCOUNT_KEY)
  return isSession(value) ? { firstName: value.firstName.trim(), contact: value.contact } : null
}

export function saveSession(store: KeyValueStore | null, session: Session): boolean {
  return write(store, ACCOUNT_KEY, session)
}

export function clearSession(store: KeyValueStore | null): void {
  try {
    store?.removeItem(ACCOUNT_KEY)
  } catch {
    // Storage is blocked: there is no session to clear.
  }
}

/** Clears every key under STORAGE_PREFIX and returns the keys it removed. */
export function removeEverything(store: Pick<Storage, 'key' | 'length' | 'removeItem'> | null): string[] {
  if (!store) return []
  try {
    const names: string[] = []
    for (let i = 0; i < store.length; i++) {
      const name = store.key(i)
      if (name?.startsWith(STORAGE_PREFIX)) names.push(name)
    }
    for (const name of names) store.removeItem(name)
    return names
  } catch {
    return []
  }
}

function isAppointment(value: unknown): value is Appointment {
  const v = value as Appointment | null
  return (
    !!v &&
    typeof v.id === 'string' &&
    !!serviceById(v.serviceId) &&
    DENTISTS.some((d) => d.id === v.dentistId) &&
    typeof v.day === 'string' &&
    isRealDate(v.day) &&
    Number.isInteger(v.start) &&
    v.start >= 0 &&
    v.start < 1440 &&
    typeof v.patient === 'string' &&
    Array.from(v.patient).length <= 60 &&
    typeof v.hmo === 'string' &&
    Array.from(v.hmo).length <= 40
  )
}

/** Appointments booked on this device, soonest first. Damaged records are dropped. */
export function loadAppointments(store: KeyValueStore | null): Appointment[] {
  const value = read(store, APPOINTMENTS_KEY)
  const list = Array.isArray(value) ? value.filter(isAppointment) : []
  return list.sort((a, b) => a.day.localeCompare(b.day) || a.start - b.start)
}

export function addAppointment(store: KeyValueStore | null, appointment: Appointment): boolean {
  if (!store) return false
  return write(store, APPOINTMENTS_KEY, [...loadAppointments(store), appointment])
}

/** Replaces `oldId` with `appointment` in one write, so there is never a second one. */
export function replaceAppointment(store: KeyValueStore | null, oldId: string, appointment: Appointment): boolean {
  if (!store) return false
  return write(store, APPOINTMENTS_KEY, [...loadAppointments(store).filter((a) => a.id !== oldId), appointment])
}

export function removeAppointment(store: KeyValueStore | null, id: string): void {
  write(store, APPOINTMENTS_KEY, loadAppointments(store).filter((a) => a.id !== id))
}

export interface AppointmentDetails {
  id: string
  treatment: string
  /** The starting price with its unit: "₱1,200 per surface". */
  price: string
  /** The dentist by role: "General dentist, chair 1". */
  dentist: string
  /** Date and time in Cebu time: "Friday, November 20, 2026, 10:30 AM". */
  when: string
  duration: string
  patient: string
  hmo: string
  checklist: string[]
  /** The six-month reminder a real clinic would send, and the day it would go out. */
  reminder: string
  reminderOn: string
  rescheduleHref: (base: string) => string
}

/** What My appointments shows for a booking, or null for a record the site no longer knows. */
export function appointmentDetails(a: Appointment): AppointmentDetails | null {
  const service = serviceById(a.serviceId)
  const dentist = DENTISTS.find((d) => d.id === a.dentistId)
  if (!service || !dentist) return null
  return {
    id: a.id,
    treatment: service.name,
    price: priceWithUnit(service),
    dentist: dentist.role,
    when: `${formatDay(a.day, 'long-year')}, ${formatClock(a.start)}`,
    duration: durationLabel(service),
    patient: a.patient,
    hmo: a.hmo,
    checklist: checklistFor(service.id, a.hmo),
    reminder: reminderMessage(firstWord(a.patient) || 'there'),
    reminderOn: formatDay(sixMonthsAfter(a.day), 'long-year'),
    rescheduleHref: (base) => bookingHref(base, service.id, a.id),
  }
}
