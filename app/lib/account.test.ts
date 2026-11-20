import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ACCOUNT_KEY,
  APPOINTMENTS_KEY,
  addAppointment,
  appointmentDetails,
  clearSession,
  codeMatches,
  demoCode,
  firstWord,
  loadAppointments,
  loadSession,
  maskContact,
  parseContact,
  removeAppointment,
  replaceAppointment,
  saveSession,
  validateFirstName,
  type Appointment,
  type KeyValueStore,
} from './account.ts'

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  }
}

/** Throws on every call, like Safari's private mode or blocked site data. */
const blockedStore: KeyValueStore = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
  removeItem: () => {
    throw new Error('blocked')
  },
}

test('an email address or a Philippine mobile number is a contact', () => {
  assert.deepEqual(parseContact(' ana.reyes@example.com '), { kind: 'email', value: 'ana.reyes@example.com' })
  assert.deepEqual(parseContact('0917 123 4567'), { kind: 'mobile', value: '09171234567' })
  assert.deepEqual(parseContact('+63 917-123-4567'), { kind: 'mobile', value: '09171234567' })
  assert.deepEqual(parseContact('639171234567'), { kind: 'mobile', value: '09171234567' })
})

test('anything else is not a contact', () => {
  for (const bad of ['', '   ', 'ana', 'ana@', '@example.com', 'ana@example', '0917 123 456', '0817 123 4567', '+1 415 555 0100', '0917-123-45678']) {
    assert.equal(parseContact(bad), null, bad)
  }
})

test('contacts are shown masked', () => {
  assert.equal(maskContact({ kind: 'email', value: 'ana.reyes@example.com' }), 'a••••••••@example.com')
  assert.equal(maskContact({ kind: 'mobile', value: '09171234567' }), '0917 ••• 4567')
})

test('a first name is required and kept short', () => {
  assert.equal(validateFirstName('Ana'), null)
  assert.match(validateFirstName('  ') ?? '', /first name/i)
  assert.match(validateFirstName('A'.repeat(41)) ?? '', /40/)
  // A name the header couldn't show (nothing left after the quotes and brackets) would leave the page half signed in.
  assert.match(validateFirstName('"<>"') ?? '', /first name/i)
})

test('the demo code is four digits, and only the same four digits match it', () => {
  const values = [0, 0.5, 0.99999]
  for (const v of values) assert.match(demoCode(() => v), /^\d{4}$/)
  assert.equal(demoCode(() => 0), '1000')
  assert.equal(demoCode(() => 0.99999), '9999')
  assert.ok(codeMatches(' 4821 ', '4821'))
  assert.ok(codeMatches('48 21', '4821'))
  assert.ok(!codeMatches('4822', '4821'))
  assert.ok(!codeMatches('', '4821'))
})

test('a session saves, loads and clears', () => {
  const store = memoryStore()
  assert.equal(loadSession(store), null)
  assert.ok(saveSession(store, { firstName: 'Ana', contact: { kind: 'email', value: 'ana@example.com' } }))
  assert.deepEqual(loadSession(store), { firstName: 'Ana', contact: { kind: 'email', value: 'ana@example.com' } })
  assert.ok(store.data.has(ACCOUNT_KEY))
  clearSession(store)
  assert.equal(loadSession(store), null)
})

test('a damaged or foreign session is ignored', () => {
  const store = memoryStore()
  store.data.set(ACCOUNT_KEY, '{not json')
  assert.equal(loadSession(store), null)
  store.data.set(ACCOUNT_KEY, JSON.stringify({ firstName: '', contact: { kind: 'email', value: 'x@y.co' } }))
  assert.equal(loadSession(store), null)
  store.data.set(ACCOUNT_KEY, JSON.stringify({ firstName: 'Ana', contact: { kind: 'fax', value: '123' } }))
  assert.equal(loadSession(store), null)
})

test('with storage blocked or missing, nothing throws and nobody is signed in', () => {
  for (const store of [blockedStore, null]) {
    assert.equal(loadSession(store), null)
    assert.equal(saveSession(store, { firstName: 'Ana', contact: { kind: 'mobile', value: '09171234567' } }), false)
    assert.doesNotThrow(() => clearSession(store))
    assert.deepEqual(loadAppointments(store), [])
    assert.equal(addAppointment(store, appointment('a')), false)
    assert.doesNotThrow(() => removeAppointment(store, 'a'))
  }
})

function appointment(id: string, day = '2026-11-20', start = 630): Appointment {
  return { id, serviceId: 'checkup', dentistId: 'general-1', day, start, patient: 'Ana Reyes', hmo: '' }
}

test('appointments made on the site are kept in date order and can be removed', () => {
  const store = memoryStore()
  assert.ok(addAppointment(store, appointment('late', '2026-12-01', 600)))
  assert.ok(addAppointment(store, appointment('early', '2026-11-20', 900)))
  assert.ok(addAppointment(store, appointment('same-day-earlier', '2026-11-20', 600)))
  assert.deepEqual(loadAppointments(store).map((a) => a.id), ['same-day-earlier', 'early', 'late'])
  removeAppointment(store, 'early')
  assert.deepEqual(loadAppointments(store).map((a) => a.id), ['same-day-earlier', 'late'])
})

test('damaged appointment records are dropped, not shown', () => {
  const store = memoryStore()
  store.data.set(APPOINTMENTS_KEY, JSON.stringify([appointment('ok'), { id: 'bad', serviceId: 'teleport' }, 'nonsense']))
  assert.deepEqual(loadAppointments(store).map((a) => a.id), ['ok'])
  store.data.set(APPOINTMENTS_KEY, 'nope')
  assert.deepEqual(loadAppointments(store), [])
})

test('the header greets with the first word of the name, cleaned for display', () => {
  assert.equal(firstWord('  Ana Marie  '), 'Ana')
  assert.equal(firstWord('Jo'), 'Jo')
  assert.equal(firstWord('"Ana"\\'), 'Ana')
  assert.equal(firstWord('   '), '')
  assert.equal(firstWord('A'.repeat(40)), 'A'.repeat(16))
  // Cut by characters, not UTF-16 units, so an emoji at the limit is never split in half.
  assert.equal(firstWord(`${'a'.repeat(15)}😀z`), `${'a'.repeat(15)}😀`)
})

test('a booking opens to its full details, in Cebu time', () => {
  const details = appointmentDetails({ id: 'x1', serviceId: 'filling', dentistId: 'general-1', day: '2026-11-20', start: 630, patient: 'Ana Reyes', hmo: 'Sample HMO' })
  assert.ok(details)
  assert.equal(details.treatment, 'Tooth-coloured filling')
  assert.equal(details.price, '₱1,200 per surface')
  assert.equal(details.dentist, 'General dentist, chair 1')
  assert.equal(details.when, 'Friday, November 20, 2026, 10:30 AM')
  assert.equal(details.duration, '45 min')
  assert.equal(details.patient, 'Ana Reyes')
  assert.equal(details.hmo, 'Sample HMO')
  assert.ok(details.checklist.length > 0 && details.checklist.every((line) => typeof line === 'string'))
  assert.match(details.reminder, /^Hi Ana, it’s been six months since your visit to Enamel/)
  assert.equal(details.reminderOn, 'Thursday, May 20, 2027')
  assert.equal(details.rescheduleHref('/enamel/'), '/enamel/book/?service=filling&reschedule=x1')
})

test('visits and packages show their visits, and the orthodontist keeps their role', () => {
  const braces = appointmentDetails({ id: 'b', serviceId: 'braces-metal', dentistId: 'ortho', day: '2026-11-21', start: 540, patient: 'Lia', hmo: '' })
  assert.ok(braces)
  assert.equal(braces.price, '₱45,000 package')
  assert.equal(braces.dentist, 'Orthodontist, chair 3')
  assert.equal(braces.when, 'Saturday, November 21, 2026, 9:00 AM')
  assert.match(braces.duration, /month/i)
  assert.equal(braces.hmo, '')
})

test('a record for an unknown treatment or dentist has no details', () => {
  assert.equal(appointmentDetails({ id: 'z', serviceId: 'teleport', dentistId: 'general-1', day: '2026-11-20', start: 600, patient: 'Ana', hmo: '' }), null)
  assert.equal(appointmentDetails({ id: 'z', serviceId: 'checkup', dentistId: 'nobody', day: '2026-11-20', start: 600, patient: 'Ana', hmo: '' }), null)
})

test('stored appointments with impossible dates or times are dropped, so one bad entry never blanks the list', () => {
  const store = memoryStore()
  const bad = [
    appointment('month13', '2026-13-45'),
    appointment('feb30', '2026-02-30'),
    appointment('minute-5000', '2026-11-20', 5000),
    appointment('negative', '2026-11-20', -30),
    { ...appointment('fraction'), start: 600.5 },
    { ...appointment('long-name'), patient: 'x'.repeat(61) },
    { ...appointment('long-hmo'), hmo: 'x'.repeat(41) },
  ]
  store.data.set(APPOINTMENTS_KEY, JSON.stringify([appointment('ok'), ...bad, appointment('also-ok', '2026-11-21')]))
  assert.deepEqual(loadAppointments(store).map((a) => a.id), ['ok', 'also-ok'])
  for (const a of loadAppointments(store)) assert.ok(appointmentDetails(a), 'every kept record can be shown')
})

test('rescheduling replaces the appointment in one write instead of adding a second', () => {
  const store = memoryStore()
  addAppointment(store, appointment('old', '2026-11-20', 600))
  addAppointment(store, appointment('other', '2026-11-24', 600))
  assert.ok(replaceAppointment(store, 'old', appointment('new', '2026-11-25', 840)))
  assert.deepEqual(loadAppointments(store).map((a) => a.id), ['other', 'new'])
  // An id that is gone (cancelled in another tab) still saves the new booking.
  assert.ok(replaceAppointment(store, 'missing', appointment('third', '2026-11-26', 540)))
  assert.equal(loadAppointments(store).length, 3)
  assert.equal(replaceAppointment(null, 'old', appointment('x')), false)
})

test('My appointments lists the HMO checklist only for a visit with an HMO', () => {
  const visit = { id: 'x', serviceId: 'filling', dentistId: 'general-1', day: '2026-11-20', start: 630, patient: 'Ana Reyes' }
  assert.deepEqual(appointmentDetails({ ...visit, hmo: '' })?.checklist, [])
  assert.ok((appointmentDetails({ ...visit, hmo: 'Sample HMO' })?.checklist.length ?? 0) > 0)
})
