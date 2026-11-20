import { test } from 'node:test'
import assert from 'node:assert/strict'
import { busyFrom, isPast, splitAppointments } from './diary.ts'
import { timeSlots } from './booking.ts'
import type { Appointment } from './account.ts'

const at = new Date(Date.UTC(2026, 10, 17, 0, 0)) // Tue 8:00 Manila, before the clinic opens
const visit = (id: string, over: Partial<Appointment> = {}): Appointment => ({
  id,
  serviceId: 'checkup',
  dentistId: 'general-1',
  day: '2026-11-20',
  start: 600,
  patient: 'Ana Reyes',
  hmo: '',
  ...over,
})
const startsFree = (day: string, dentist: string, minutes: number, busy = busyFrom([])) =>
  timeSlots(day, dentist, minutes, at, busy).filter((s) => s.available).map((s) => s.start)

test('a visitor’s own appointment takes its chair and time', () => {
  // Find a day and chair where 10:00 is open in the sample diary, then book it.
  const day = ['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-23', '2026-11-24'].find((d) => startsFree(d, 'general-1', 30).includes(600))
  assert.ok(day, 'a free 10:00 exists in the sample week')
  const mine = busyFrom([visit('a', { day })])
  const slot = (list: ReturnType<typeof timeSlots>) => list.find((s) => s.start === 600)
  assert.equal(slot(timeSlots(day, 'general-1', 30, at))?.available, true)
  assert.equal(slot(timeSlots(day, 'general-1', 30, at, mine))?.available, false)
  assert.equal(slot(timeSlots(day, 'general-1', 30, at, mine))?.yours, true)
})

test('a longer treatment cannot start inside, or run into, an appointment of the same chair', () => {
  const mine = busyFrom([visit('a', { serviceId: 'filling', start: 600 })]) // 45 min: 10:00 to 10:45
  const day = '2026-11-20'
  const before = timeSlots(day, 'general-1', 90, at, mine)
  for (const s of before.filter((s) => s.start > 600 - 90 && s.start < 645)) assert.equal(s.available, false, `${s.start}`)
  // A slot that ends exactly when mine starts, or starts when mine ends, does not overlap it (when the sample diary has it free).
  const plain = timeSlots(day, 'general-1', 30, at)
  const touching = timeSlots(day, 'general-1', 30, at, mine)
  for (const start of [570, 660]) assert.equal(touching.find((s) => s.start === start)?.available, plain.find((s) => s.start === start)?.available, `${start}`)
})

test('another chair, another day, or a rescheduled appointment’s own slot stay free', () => {
  const day = '2026-11-20'
  const mine = busyFrom([visit('a', { day, start: 600 })])
  assert.deepEqual(timeSlots(day, 'general-2', 30, at, mine), timeSlots(day, 'general-2', 30, at))
  assert.deepEqual(timeSlots('2026-11-21', 'general-1', 30, at, mine), timeSlots('2026-11-21', 'general-1', 30, at))
  const moving = busyFrom([visit('a', { day, start: 600 })], 'a')
  assert.deepEqual(timeSlots(day, 'general-1', 30, at, moving), timeSlots(day, 'general-1', 30, at))
})

test('appointments for an unknown treatment take no time', () => {
  assert.deepEqual(busyFrom([visit('a', { serviceId: 'teleport' })]), [])
})

test('an appointment is past once its start time has gone, in Cebu time', () => {
  const a = visit('a', { day: '2026-11-20', start: 600 }) // Fri 10:00
  assert.equal(isPast(a, new Date(Date.UTC(2026, 10, 20, 1, 59))), false) // 9:59 Manila
  assert.equal(isPast(a, new Date(Date.UTC(2026, 10, 20, 2, 0))), true) // 10:00 Manila
  assert.equal(isPast(a, new Date(Date.UTC(2026, 10, 19, 20, 0))), false) // Fri 04:00 Manila
  assert.equal(isPast(a, new Date(Date.UTC(2026, 10, 21, 0, 0))), true)
})

test('upcoming visits are soonest first, past visits most recent first', () => {
  const now = new Date(Date.UTC(2026, 10, 20, 4, 0)) // Fri 12:00 Manila
  const list = [
    visit('later', { day: '2026-11-24', start: 540 }),
    visit('this-morning', { day: '2026-11-20', start: 540 }),
    visit('this-afternoon', { day: '2026-11-20', start: 900 }),
    visit('last-week', { day: '2026-11-13', start: 600 }),
    visit('yesterday', { day: '2026-11-19', start: 600 }),
  ]
  const { upcoming, past } = splitAppointments(list, now)
  assert.deepEqual(upcoming.map((a) => a.id), ['this-afternoon', 'later'])
  assert.deepEqual(past.map((a) => a.id), ['this-morning', 'yesterday', 'last-week'])
  assert.deepEqual(splitAppointments([], now), { upcoming: [], past: [] })
})
