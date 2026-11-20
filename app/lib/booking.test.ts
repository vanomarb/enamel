import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ANY_GENERAL, DENTISTS, asksForDentist, bookableDays, chairFor, clinicDay, dentistDays, dentistsFor, sixMonthsAfter, timeSlots, validatePatient, weekdayColumn } from './booking.ts'

const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay()
const tuesday8amManila = new Date(Date.UTC(2026, 10, 17, 0, 0))

test('no Sundays and the clinic day follows Manila', () => {
  const saturdayNightManila = new Date(Date.UTC(2026, 10, 21, 12, 0)) // Sat 20:00 Manila, after hours
  assert.deepEqual(bookableDays(saturdayNightManila, 2), ['2026-11-23', '2026-11-24'])
})

test('slots respect lunch, closing and the orthodontist day', () => {
  const at = new Date(Date.UTC(2026, 10, 17, 0, 0)) // Tue 08:00 Manila
  const wed = timeSlots('2026-11-18', 'general-1', 90, at) // Wednesday
  assert.equal(wed.some((s) => s.start === 690), false); assert.equal(Math.max(...wed.map((s) => s.start)), 990)
  assert.deepEqual(timeSlots('2026-11-18', 'ortho', 30, at), [])
})

test('patient details are checked', () => {
  assert.ok(validatePatient({ name: ' ', hmo: '' }).name); assert.deepEqual(validatePatient({ name: 'Ana Reyes', hmo: '' }), {})
  assert.ok(validatePatient({ name: 'Ana Reyes', hmo: 'x'.repeat(41) }).hmo)
})

test('today is bookable while a slot remains', () => {
  assert.deepEqual(bookableDays(tuesday8amManila, 3), ['2026-11-17', '2026-11-18', '2026-11-19'])
  const tuesday1735 = new Date(Date.UTC(2026, 10, 17, 9, 35)) // 17:35 Manila: the 17:30 slot has gone
  assert.equal(bookableDays(tuesday1735, 1)[0], '2026-11-18')
})

test('a visitor abroad still gets Cebu’s calendar', () => {
  // 15:30 UTC on Saturday is still Saturday morning in New York, but 23:30 in Cebu.
  assert.deepEqual(bookableDays(new Date(Date.UTC(2026, 10, 21, 15, 30)), 1), ['2026-11-23'])
})

test('Sunday never appears, however far ahead', () => {
  const days = bookableDays(tuesday8amManila, 60)
  assert.equal(days.length, 60)
  assert.equal(days.some((d) => weekday(d) === 0), false)
  assert.deepEqual(bookableDays(tuesday8amManila, 0), [])
})

test('nobody has slots on a Sunday, and an unknown dentist has none at all', () => {
  for (const d of DENTISTS) assert.deepEqual(timeSlots('2026-11-22', d.id, 30, tuesday8amManila), [])
  assert.deepEqual(timeSlots('2026-11-18', 'nobody', 30, tuesday8amManila), [])
})

test('every slot sits on the half-hour grid, skips lunch and ends by 6:00 PM', () => {
  for (const minutes of [15, 20, 30, 45, 60, 90]) {
    for (const s of timeSlots('2026-11-19', 'general-2', minutes, tuesday8amManila)) {
      assert.equal(s.start % 30, 0)
      assert.ok(s.start >= 540 && s.start + minutes <= 1080, `${s.start} + ${minutes} fits the day`)
      assert.equal(s.start < 780 && s.start + minutes > 720, false, `${s.start} + ${minutes} misses lunch`)
    }
  }
})

test('past slots are unavailable today, and a past day is closed', () => {
  const wednesday1005 = new Date(Date.UTC(2026, 10, 18, 2, 5)) // 10:05 Manila
  const today = timeSlots('2026-11-18', 'general-1', 30, wednesday1005)
  assert.equal(today.filter((s) => s.start <= 605).some((s) => s.available), false)
  assert.equal(timeSlots('2026-11-16', 'general-1', 30, wednesday1005).some((s) => s.available), false)
})

test('taken slots are the same every time, and a long visit needs every half hour free', () => {
  const week = ['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21']
  const short = week.flatMap((d) => timeSlots(d, 'general-1', 30, tuesday8amManila))
  assert.deepEqual(short, week.flatMap((d) => timeSlots(d, 'general-1', 30, tuesday8amManila)))
  assert.ok(short.some((s) => s.available) && short.some((s) => !s.available), 'some free, some taken')
  for (const day of week) {
    const halfHours = new Map(timeSlots(day, 'general-1', 30, tuesday8amManila).map((s) => [s.start, s.available]))
    for (const s of timeSlots(day, 'general-1', 90, tuesday8amManila)) {
      if (s.available) for (const b of [s.start, s.start + 30, s.start + 60]) assert.equal(halfHours.get(b), true)
    }
  }
})

test('the orthodontist works Saturdays only, and braces go to the orthodontist', () => {
  assert.deepEqual(DENTISTS.find((d) => d.id === 'ortho')?.weekdays, [6])
  for (const id of ['general-1', 'general-2'] as const) assert.deepEqual(DENTISTS.find((d) => d.id === id)?.weekdays, [1, 2, 3, 4, 5, 6])
  assert.ok(timeSlots('2026-11-21', 'ortho', 60, tuesday8amManila).length > 0)
  assert.deepEqual(dentistsFor('braces-ceramic').map((d) => d.id), ['ortho'])
  assert.deepEqual(dentistsFor('cleaning').map((d) => d.id), ['general-1', 'general-2'])
})

test('each dentist is offered only the days they work', () => {
  const saturdays = dentistDays(tuesday8amManila, 'ortho', 4)
  assert.deepEqual(saturdays, ['2026-11-21', '2026-11-28', '2026-12-05', '2026-12-12'])
  const general = dentistDays(tuesday8amManila, 'general-1', 12)
  assert.equal(general.length, 12)
  assert.equal(general.some((d) => weekday(d) === 0), false)
})

test('names are trimmed and limited; the HMO is optional', () => {
  assert.ok(validatePatient({ name: 'A', hmo: '' }).name)
  assert.ok(validatePatient({ name: 'x'.repeat(61), hmo: '' }).name)
  assert.deepEqual(validatePatient({ name: `  ${'x'.repeat(60)}  `, hmo: '   ' }), {})
  assert.deepEqual(validatePatient({ name: 'Jo', hmo: 'y'.repeat(40) }), {})
  assert.equal(validatePatient({ name: '', hmo: '' }).name, 'Enter the patient’s name.')
})

test('the reminder falls six months after the visit, on a real date', () => {
  assert.equal(sixMonthsAfter('2026-11-18'), '2027-05-18')
  assert.equal(sixMonthsAfter('2026-08-31'), '2027-02-28')
})

const wedMorning = new Date(Date.UTC(2026, 10, 17, 0, 0)) // Tue 8:00 Manila, before the clinic opens

test('general treatments skip the dentist step, braces keep it', () => {
  assert.equal(asksForDentist('filling'), false)
  assert.equal(asksForDentist('checkup'), false)
  assert.equal(asksForDentist('braces-metal'), true)
  assert.equal(asksForDentist('braces-ceramic'), true)
  assert.equal(asksForDentist('teleport'), true, 'an unknown treatment never skips a step')
})

test('"any general dentist" is free at a time when either chair is free', () => {
  const day = '2026-11-20'
  const one = timeSlots(day, 'general-1', 30, wedMorning)
  const two = timeSlots(day, 'general-2', 30, wedMorning)
  const any = timeSlots(day, ANY_GENERAL, 30, wedMorning)
  assert.deepEqual(any.map((s) => s.start), one.map((s) => s.start))
  for (const [i, slot] of any.entries()) assert.equal(slot.available, one[i].available || two[i].available, `${slot.start}`)
  assert.ok(any.some((s) => s.available) && any.some((s) => !s.available || one.some((o) => !o.available)), 'the day is not all free')
})

test('"any general dentist" works the clinic days of the general chairs and no others', () => {
  assert.deepEqual(timeSlots('2026-11-22', ANY_GENERAL, 30, wedMorning), [], 'Sunday')
  assert.equal(dentistDays(wedMorning, ANY_GENERAL, 12).length, 12)
  assert.deepEqual(dentistDays(wedMorning, ANY_GENERAL, 12), dentistDays(wedMorning, 'general-1', 12))
})

test('a free time is given to the first general chair that has it, and booking it takes that chair', () => {
  const day = '2026-11-20'
  const slots = timeSlots(day, ANY_GENERAL, 30, wedMorning).filter((s) => s.available)
  for (const slot of slots) {
    const chair = chairFor(day, ANY_GENERAL, slot.start, 30, wedMorning)
    const first = ['general-1', 'general-2'].find((id) => timeSlots(day, id, 30, wedMorning).find((s) => s.start === slot.start)?.available)
    assert.equal(chair, first, `${slot.start}`)
  }
  // The visitor already holds chair 1 at a time where chair 1 was the one free: the same time moves to chair 2 if it is free, else it is gone.
  const target = slots.find((s) => chairFor(day, ANY_GENERAL, s.start, 30, wedMorning) === 'general-1')
  assert.ok(target, 'some time goes to chair 1')
  const mine = [{ day, dentistId: 'general-1', start: target.start, minutes: 30 }]
  const after = chairFor(day, ANY_GENERAL, target.start, 30, wedMorning, mine)
  const chairTwoFree = timeSlots(day, 'general-2', 30, wedMorning).find((s) => s.start === target.start)?.available
  assert.equal(after, chairTwoFree ? 'general-2' : undefined)
  assert.equal(timeSlots(day, ANY_GENERAL, 30, wedMorning, mine).find((s) => s.start === target.start)?.available, !!chairTwoFree)
})

test('a named chair is only given when it is free; no chair is given for a taken time', () => {
  const day = '2026-11-20'
  const taken = timeSlots(day, 'general-1', 30, wedMorning).find((s) => !s.available)!
  assert.equal(chairFor(day, 'general-1', taken.start, 30, wedMorning), undefined)
  const free = timeSlots(day, 'general-1', 30, wedMorning).find((s) => s.available)!
  assert.equal(chairFor(day, 'general-1', free.start, 30, wedMorning), 'general-1')
})

test('the day grid puts each clinic day in its weekday column, Monday to Saturday', () => {
  assert.equal(weekdayColumn('2026-11-16'), 1, 'Monday')
  assert.equal(weekdayColumn('2026-11-19'), 4, 'Thursday')
  assert.equal(weekdayColumn('2026-11-21'), 6, 'Saturday')
  assert.equal(weekdayColumn('2026-11-22'), undefined, 'Sunday has no column')
})

test('the phone menu shows today’s hours in Cebu, whatever the visitor’s own clock says', () => {
  // Wednesday 10:00 in Cebu.
  assert.deepEqual(clinicDay(new Date(Date.UTC(2026, 10, 18, 2, 0))), {
    label: 'Today, Wednesday',
    hours: '9:00 AM to 6:00 PM',
    note: 'No appointments from 12:00 PM to 1:00 PM.',
  })
  // Saturday morning: the orthodontist is in.
  assert.deepEqual(clinicDay(new Date(Date.UTC(2026, 10, 21, 1, 0))), {
    label: 'Today, Saturday',
    hours: '9:00 AM to 6:00 PM',
    note: 'The orthodontist is in today.',
  })
  // 23:30 UTC on Saturday is already Sunday morning in Cebu: closed.
  assert.deepEqual(clinicDay(new Date(Date.UTC(2026, 10, 21, 23, 30))), {
    label: 'Today, Sunday',
    hours: 'Closed',
    note: 'Open again Monday at 9:00 AM.',
  })
})
