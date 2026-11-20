import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { closeAll, loadPage, type Page } from '../../tests/harness.ts'
import { APPOINTMENTS_KEY, type Appointment } from '../lib/account.ts'
import { hoursText, lunchText } from '../lib/booking.ts'
import { priceWithUnit, serviceById } from '../lib/services.ts'

/* Free half-hours come from the sample diary, so the tests pick the first free day and time instead of naming one. */

after(closeAll)

function book(query = '', options: Parameters<typeof loadPage>[2] = {}) {
  const p = loadPage('book/index.html', `book/${query}`, options)
  assert.deepEqual(p.boot(), [], 'starts without errors')
  return p
}

const current = (p: Page) => p.$('[data-stepper] [aria-current="step"] h3')
const choose = (p: Page, value: string | number) => p.click(`[data-stepper] [data-choose="${value}"]`)
const firstFree = (p: Page) => {
  const option = p.$$<HTMLButtonElement>('[data-stepper] [aria-current="step"] [data-choose]').find((b) => !b.disabled)
  assert.ok(option, 'there is a free choice')
  return option
}
const pickFirstFree = (p: Page) => {
  const option = firstFree(p)
  const value = option.dataset.choose!
  p.click(option)
  return value
}
const fillAndConfirm = (p: Page, name: string, hmo = '') => {
  p.type('#patient-name', name)
  if (hmo) p.type('#patient-hmo', hmo)
  p.submit('form[data-details]')
}

test('a general treatment skips the Dentist step: treatment, day, time, details', () => {
  const p = book()
  assert.deepEqual(p.$$('[data-stepper] > li').map((li) => li.className.includes('is-current')), [true, false, false, false, false])
  assert.equal(p.text('[data-stepper] [aria-current="step"] h3'), 'Step 1 of 5: Choose a treatment', 'five steps until a treatment is chosen')
  choose(p, 'cleaning')
  assert.equal(p.text('[data-stepper] [aria-current="step"] h3'), 'Step 2 of 4: Choose a day', 'four steps, and the next one is the day')
  assert.equal(p.$$('[data-stepper] > li').length, 4)
  assert.ok(!p.text('[data-stepper]').includes('Dentist'), 'no Dentist step for a general treatment')
  assert.equal(p.document.activeElement, current(p), 'focus is on the new step’s heading')
  assert.ok(p.text('[data-stepper] .is-done').includes(`Cleaning, starts at ${priceWithUnit(serviceById('cleaning')!)}`), 'the choice is summed up under Change')
})

test('braces keep the Dentist step, with the orthodontist, and are Saturdays only', () => {
  const p = book()
  choose(p, 'braces-metal')
  assert.equal(p.text('[data-stepper] [aria-current="step"] h3'), 'Step 2 of 5: Choose a dentist')
  const dentists = p.$$<HTMLButtonElement>('[data-stepper] [aria-current="step"] [data-choose]')
  assert.deepEqual(dentists.map((b) => b.dataset.choose), ['ortho'], 'only the orthodontist does braces')
  assert.match(dentists[0].textContent!, /Orthodontist, chair 3/)
  choose(p, 'ortho')
  assert.equal(p.text('[data-stepper] [aria-current="step"] h3'), 'Step 3 of 5: Choose a day')
  const days = p.$$<HTMLButtonElement>('[data-stepper] [aria-current="step"] [data-choose]')
  assert.ok(days.length > 0 && days.length <= 4)
  assert.ok(days.every((d) => new Date(`${d.dataset.choose}T00:00:00Z`).getUTCDay() === 6), 'every offered day is a Saturday')
  assert.ok(p.text('[data-stepper]').includes('Saturdays only. Closed on Sundays.'))
})

test('the day step offers no Sunday, and the time step shows morning and afternoon around lunch', () => {
  const p = book()
  choose(p, 'cleaning')
  const days = p.$$<HTMLButtonElement>('[data-stepper] [aria-current="step"] [data-choose]')
  assert.ok(days.length >= 6)
  assert.ok(days.every((d) => new Date(`${d.dataset.choose}T00:00:00Z`).getUTCDay() !== 0), 'no Sundays')
  assert.match(days[0].textContent!, /^Today/, 'the first morning is still ahead, so today is offered')
  pickFirstFree(p)
  assert.equal(p.text('[data-stepper] [aria-current="step"] h3'), 'Step 3 of 4: Choose a time')
  assert.ok(p.text('[data-stepper]').includes(`No appointments from ${lunchText()}.`), 'the lunch hour is said the way the data has it')
  const times = p.$$<HTMLButtonElement>('[data-stepper] [aria-current="step"] [data-choose]').map((b) => Number(b.dataset.choose))
  assert.ok(times[0] >= 540 && times.every((t) => t < 720 || t >= 780), 'nothing from 12:00 to 1:00 PM')
  assert.ok(p.$$('[data-stepper] [role="group"] > p').some((x) => x.textContent === 'Morning') && p.$$('[data-stepper] [role="group"] > p').some((x) => x.textContent === 'Afternoon'))
})

test('confirming without an HMO says nothing was sent, previews the reminder, and gives the self-pay note', () => {
  const p = book()
  choose(p, 'cleaning')
  const day = pickFirstFree(p)
  const start = pickFirstFree(p)
  assert.equal(p.text('[data-stepper] [aria-current="step"] h3'), 'Step 4 of 4: Patient details')
  assert.equal(p.document.activeElement, current(p))
  fillAndConfirm(p, 'Ana Cruz')

  assert.equal(p.$('[data-stepper]').hidden, true)
  const done = p.$('[data-done]')
  assert.equal(done.hidden, false)
  assert.equal(p.document.activeElement, done.querySelector('h3'), 'focus goes to the confirmation heading')
  assert.equal(p.text('[data-done] h3'), 'Booking ready. Nothing was sent.')
  const text = p.text('[data-done]')
  assert.ok(text.includes('Cleaning'), 'the treatment')
  assert.match(text, /General dentist, chair [12]/, 'a general dentist’s chair')
  assert.ok(text.includes('₱1,000'), 'the starting price')
  assert.ok(text.includes('Ana Cruz'))
  assert.ok(text.includes('Hi Ana, it’s been six months'), 'the reminder uses the first name')
  assert.ok(text.includes('Paying without an HMO? GCash, Maya, cards and cash are all fine.'))
  assert.ok(!text.includes('HMO checklist'), 'no HMO checklist without an HMO')
  assert.equal(p.$$('[data-done] dt').some((dt) => dt.textContent === 'HMO'), false)
  assert.equal(p.$('[data-done] a[href="/enamel/account/"]').textContent, 'My appointments')

  const saved = p.storage(APPOINTMENTS_KEY) as Appointment[]
  assert.equal(saved.length, 1)
  assert.deepEqual({ serviceId: saved[0].serviceId, day: saved[0].day, start: saved[0].start, patient: saved[0].patient, hmo: saved[0].hmo }, { serviceId: 'cleaning', day, start: Number(start), patient: 'Ana Cruz', hmo: '' })
  assert.match(saved[0].dentistId, /^general-[12]$/, 'a real chair, not "any"')
})

test('confirming with an HMO adds the HMO to the booking and the checklist for that treatment', () => {
  const p = book()
  choose(p, 'filling')
  pickFirstFree(p)
  pickFirstFree(p)
  fillAndConfirm(p, 'Ben Reyes', 'Maxicare')
  const text = p.text('[data-done]')
  assert.ok(p.$$('[data-done] dt').some((dt) => dt.textContent === 'HMO'))
  assert.ok(text.includes('Maxicare'))
  assert.ok(text.includes('HMO checklist for this visit'))
  assert.ok(text.includes('Bring your HMO card and one valid ID.'))
  assert.ok(!text.includes('Paying without an HMO'))
  assert.ok(text.includes('₱1,200') && text.includes('per surface'), 'the filling’s price keeps its unit')
  assert.equal((p.storage(APPOINTMENTS_KEY) as Appointment[])[0].hmo, 'Maxicare')
})

test('the details step checks the name: a message, a flag, focus on the field, and the message goes when it is fixed', () => {
  const p = book()
  choose(p, 'cleaning')
  pickFirstFree(p)
  pickFirstFree(p)
  p.submit('form[data-details]')
  assert.equal(p.text('#patient-name-error'), 'Enter the patient’s name.')
  assert.equal(p.$('#patient-name').getAttribute('aria-invalid'), 'true')
  assert.equal(p.document.activeElement, p.$('#patient-name'))
  assert.equal(p.$('[data-done]').hidden, true, 'nothing is booked')
  p.type('#patient-name', 'A')
  assert.equal(p.text('#patient-name-error'), 'Enter at least 2 characters.')
  p.type('#patient-name', 'Al')
  assert.equal(p.$('#patient-name-error').hidden, true)
  assert.equal(p.$('#patient-name').hasAttribute('aria-invalid'), false)
  assert.equal(p.window.localStorage.getItem(APPOINTMENTS_KEY), null, 'still nothing kept')
})

test('Change goes back to an earlier step, and changing the treatment clears the day and time', () => {
  const p = book()
  choose(p, 'cleaning')
  pickFirstFree(p)
  pickFirstFree(p)
  p.click('[data-stepper] [data-change="service"]')
  assert.equal(p.text('[data-stepper] [aria-current="step"] h3').includes('Choose a treatment'), true)
  choose(p, 'extraction')
  assert.equal(p.text('[data-stepper] [aria-current="step"] h3'), 'Step 2 of 4: Choose a day', 'asks for the day again')
  assert.ok(p.text('[data-stepper] .is-done').includes('Simple extraction'))
})

test('a slot you booked is taken: the same time shows as already booked by you', () => {
  // Braces have one chair, so a booked time is gone; the same goes for "any general dentist" once both chairs are used.
  const p = book()
  choose(p, 'braces-metal')
  choose(p, 'ortho')
  const day = pickFirstFree(p)
  const start = pickFirstFree(p)
  fillAndConfirm(p, 'Ana Cruz')
  assert.equal(p.text('[data-done] h3'), 'Booking ready. Nothing was sent.')

  p.click('[data-again]')
  assert.equal(p.$('[data-done]').hidden, true)
  choose(p, 'braces-metal')
  choose(p, 'ortho')
  choose(p, day)
  const slot = p.$<HTMLButtonElement>(`[data-stepper] [data-choose="${start}"]`)
  assert.equal(slot.disabled, true, 'the time you booked is no longer offered')
  assert.match(slot.textContent!, /already booked by you/)
  assert.ok(p.$$<HTMLButtonElement>('[data-stepper] [aria-current="step"] [data-choose]').some((b) => !b.disabled), 'other times are still there')
})

test('a general slot is taken once both general chairs are yours at that time', () => {
  const p0 = book()
  choose(p0, 'cleaning')
  const day = pickFirstFree(p0)
  const start = Number(pickFirstFree(p0))
  p0.close()
  const mine = (dentistId: string, id: string): Appointment => ({ id, serviceId: 'cleaning', dentistId, day, start, patient: 'Ana Cruz', hmo: '' })
  const p = book('', { storage: { [APPOINTMENTS_KEY]: [mine('general-1', 'a'), mine('general-2', 'b')] } })
  choose(p, 'cleaning')
  choose(p, day)
  const slot = p.$<HTMLButtonElement>(`[data-stepper] [data-choose="${start}"]`)
  assert.equal(slot.disabled, true)
  assert.match(slot.textContent!, /already booked by you/)
})

test('a link with ?service= starts on that treatment’s next step, and an unknown one is ignored', () => {
  const p = book('?service=whitening')
  assert.equal(p.text('[data-stepper] [aria-current="step"] h3'), 'Step 2 of 4: Choose a day')
  assert.ok(p.text('[data-stepper] .is-done').includes('In-clinic whitening'))
  assert.equal(p.document.documentElement.hasAttribute('data-booking-pending'), false, 'the stepper is shown')
  const unknown = book('?service=teleport')
  assert.equal(unknown.text('[data-stepper] [aria-current="step"] h3'), 'Step 1 of 5: Choose a treatment')
})

test('reschedule moves the visit: the old booking is replaced by the new time, not added to', () => {
  const old: Appointment = { id: 'old-1', serviceId: 'cleaning', dentistId: 'general-1', day: '2026-11-18', start: 600, patient: 'Ana Cruz', hmo: 'Maxicare' }
  const p = book('?service=cleaning&reschedule=old-1', { storage: { [APPOINTMENTS_KEY]: [old] } })
  assert.equal(p.text('[data-stepper] [aria-current="step"] h3'), 'Step 2 of 4: Choose a day')
  assert.ok(p.text('[data-stepper]').includes('You’re moving an appointment: the old time is released when you confirm.'))
  const day = pickFirstFree(p)
  const start = Number(pickFirstFree(p))
  assert.equal(p.$<HTMLInputElement>('#patient-name').value, 'Ana Cruz', 'the patient is filled in')
  assert.equal(p.$<HTMLInputElement>('#patient-hmo').value, 'Maxicare')
  p.submit('form[data-details]')
  assert.equal(p.text('[data-done] h3'), 'Appointment moved. Nothing was sent.')
  const saved = p.storage(APPOINTMENTS_KEY) as Appointment[]
  assert.equal(saved.length, 1, 'one appointment, not two')
  assert.notEqual(saved[0].id, 'old-1')
  assert.deepEqual({ day: saved[0].day, start: saved[0].start, patient: saved[0].patient, hmo: saved[0].hmo }, { day, start, patient: 'Ana Cruz', hmo: 'Maxicare' })
})

test('a reschedule link to a visit that is gone, or already past, only chooses the treatment', () => {
  const past: Appointment = { id: 'past-1', serviceId: 'cleaning', dentistId: 'general-1', day: '2026-11-10', start: 600, patient: 'Ana Cruz', hmo: '' }
  const p = book('?service=cleaning&reschedule=past-1', { storage: { [APPOINTMENTS_KEY]: [past] } })
  assert.ok(!p.text('[data-stepper]').includes('moving an appointment'))
  p.close()
  const gone = book('?service=cleaning&reschedule=nope')
  assert.ok(!gone.text('[data-stepper]').includes('moving an appointment'))
  assert.equal(gone.text('[data-stepper] [aria-current="step"] h3'), 'Step 2 of 4: Choose a day')
})

test('the booking page’s own hours text agrees with the data', () => {
  const p = book()
  assert.ok(p.text('[data-no-js]').includes(hoursText()))
})
