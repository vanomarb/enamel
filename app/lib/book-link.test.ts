import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bookingHref, rescheduleFromSearch, serviceFromSearch } from './book-link.ts'
import { SERVICES } from './services.ts'

test('a booking link names a treatment the stepper can preselect', () => {
  assert.equal(serviceFromSearch('?service=filling'), 'filling')
  assert.equal(serviceFromSearch('service=braces-metal'), 'braces-metal')
  assert.equal(serviceFromSearch('?utm=x&service=crown'), 'crown')
})

test('unknown, empty or missing treatments are ignored', () => {
  assert.equal(serviceFromSearch(''), null)
  assert.equal(serviceFromSearch('?service='), null)
  assert.equal(serviceFromSearch('?service=teleport'), null)
  assert.equal(serviceFromSearch('?service=Filling'), null)
  assert.equal(serviceFromSearch('?treatment=filling'), null)
  assert.equal(serviceFromSearch('?service=%3Cscript%3E'), null)
})

test('when a link repeats the parameter, the first one counts', () => {
  assert.equal(serviceFromSearch('?service=crown&service=filling'), 'crown')
})

test('every treatment has a booking link that reads back as itself', () => {
  for (const s of SERVICES) {
    const href = bookingHref('/enamel/', s.id)
    assert.equal(href, `/enamel/book/?service=${s.id}`)
    assert.equal(serviceFromSearch(new URL(href, 'https://example.test').search), s.id)
  }
})

test('a reschedule link carries the appointment it replaces', () => {
  const href = bookingHref('/enamel/', 'filling', 'k3x-9ab')
  assert.equal(href, '/enamel/book/?service=filling&reschedule=k3x-9ab')
  assert.equal(rescheduleFromSearch(new URL(href, 'https://example.test').search), 'k3x-9ab')
  assert.equal(serviceFromSearch(new URL(href, 'https://example.test').search), 'filling')
  assert.equal(bookingHref('/enamel/', 'filling'), '/enamel/book/?service=filling')
  assert.equal(rescheduleFromSearch('?service=filling'), null)
  assert.equal(rescheduleFromSearch('?reschedule='), null)
})
