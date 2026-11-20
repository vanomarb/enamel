import { serviceById } from './services.ts'

/** /enamel/book/?service=filling; with an appointment id, a Reschedule link. */
export function bookingHref(base: string, serviceId: string, rescheduleId?: string): string {
  const reschedule = rescheduleId ? `&reschedule=${encodeURIComponent(rescheduleId)}` : ''
  return `${base}book/?service=${encodeURIComponent(serviceId)}${reschedule}`
}

/** The appointment a Reschedule link moves, or null; the caller checks that it still exists. */
export function rescheduleFromSearch(search: string): string | null {
  return new URLSearchParams(search).get('reschedule') || null
}

/** The treatment a booking link asks for, or null when it is missing or not one of the clinic's treatments. */
export function serviceFromSearch(search: string): string | null {
  const id = new URLSearchParams(search).get('service')
  return id && serviceById(id) ? id : null
}
