import type { Appointment } from './account.ts'
import type { Busy } from './booking.ts'
import { serviceById } from './services.ts'
import { manilaTime } from './time.ts'

/** The chair time the appointments take; `exceptId` leaves out the one being rescheduled. */
export function busyFrom(appointments: Appointment[], exceptId?: string): Busy[] {
  return appointments.flatMap((a) => {
    const service = serviceById(a.serviceId)
    return service && a.id !== exceptId ? [{ day: a.day, dentistId: a.dentistId, start: a.start, minutes: service.minutes }] : []
  })
}

/** An appointment is past once its start time has gone (Cebu time), the same moment the booking stops offering a slot. */
export function isPast(a: Appointment, at: Date): boolean {
  const now = manilaTime(at)
  return a.day < now.isoDate || (a.day === now.isoDate && a.start <= now.minutes)
}

/** Upcoming visits soonest first; past visits most recent first. */
export function splitAppointments(appointments: Appointment[], at: Date): { upcoming: Appointment[]; past: Appointment[] } {
  const byTime = (a: Appointment, b: Appointment) => a.day.localeCompare(b.day) || a.start - b.start
  const sorted = [...appointments].sort(byTime)
  return { upcoming: sorted.filter((a) => !isPast(a, at)), past: sorted.filter((a) => isPast(a, at)).reverse() }
}
