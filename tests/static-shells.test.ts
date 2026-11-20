import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { archMarkup, toothListMarkup } from '../app/components/tooth-explorer/tooth-explorer.ts'
import { bookingShellMarkup, doneMarkup, type State } from '../app/book/booking.ts'
import { GROUPS, SERVICES } from '../app/lib/services.ts'

/* The explorer and the booking start from markup already in the page; these fail if it drifts from the code.
   To refresh it, print the markup and paste it into the partial and the Book page:
   node --input-type=module -e "import { archMarkup, toothListMarkup } from './app/components/tooth-explorer/tooth-explorer.ts'; import { bookingShellMarkup } from './app/book/booking.ts'; console.log(archMarkup('upper') + '\n\n' + archMarkup('lower') + '\n\n' + toothListMarkup() + '\n\n' + bookingShellMarkup())" */
const explorer = readFileSync(new URL('../app/components/tooth-explorer/tooth-explorer.html', import.meta.url), 'utf8')
const treatments = readFileSync(new URL('../app/treatments/index.html', import.meta.url), 'utf8')
const book = readFileSync(new URL('../app/book/index.html', import.meta.url), 'utf8')

test('the tooth chart in the shared partial is the one the explorer draws', () => {
  assert.ok(explorer.includes(archMarkup('upper')), 'upper arch matches archMarkup("upper")')
  assert.ok(explorer.includes(archMarkup('lower')), 'lower arch matches archMarkup("lower")')
  assert.ok(explorer.includes(toothListMarkup()), 'tooth list matches toothListMarkup()')
})

test('every tooth in the static chart carries its FDI number and name', () => {
  const teeth = [...explorer.matchAll(/<g class="tooth" data-fdi="(\d+)" aria-label="([^"]+), tooth (\d+)"/g)]
  assert.equal(teeth.length, 32)
  for (const [, fdi, , labelled] of teeth) assert.equal(fdi, labelled)
})

test('the booking in the page starts exactly where the stepper starts', () => {
  assert.ok(book.includes(bookingShellMarkup()))
})

test('the filter chips match the groups and their counts', () => {
  const chips = [...treatments.matchAll(/<input type="radio" name="service-filter" value="([a-z]+)"(?: checked)? \/><span>([^<]+)<\/span><span class="sr-only">, (\d+) treatments?<\/span>/g)]
  assert.deepEqual(
    chips.map(([, value, label, count]) => [value, label, Number(count)]),
    [['all', 'All', SERVICES.length], ...GROUPS.map((g) => [g.id, g.label, SERVICES.filter((s) => s.group === g.id).length])],
  )
})

const booked = (hmo: string): State => ({ step: 'done', serviceId: 'filling', dentistId: 'general-2', day: '2026-11-20', start: 600, name: 'Ana Reyes', hmo, tried: true })

test('the confirmation shows the HMO checklist only when an HMO was given', () => {
  assert.doesNotMatch(doneMarkup(booked(''), false), /HMO checklist/, 'self-pay: no checklist')
  assert.doesNotMatch(doneMarkup(booked('   '), false), /HMO checklist/, 'a blank HMO is self-pay too')
  assert.match(doneMarkup(booked(''), false), /Paying without an HMO\?/, 'self-pay still hears how to pay')
  const withHmo = doneMarkup(booked('Sample HMO'), false)
  assert.match(withHmo, /HMO checklist for this visit/)
  assert.match(withHmo, /letter of authorization/)
  assert.doesNotMatch(withHmo, /Paying without an HMO/)
})

test('the confirmation names the chair a general treatment was given', () => {
  assert.match(doneMarkup(booked(''), false), /General dentist, chair 2/)
})
