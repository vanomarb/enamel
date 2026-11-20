import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TEETH } from './teeth.ts'
import { NOTE_FACTS, toothNotes } from './tooth-anatomy.ts'

test('every adult tooth has notes, with no empty field, shared by left and right partners', () => {
  assert.equal(TEETH.length, 32)
  for (const { fdi } of TEETH) {
    const notes = toothNotes(fdi)
    for (const [key, value] of Object.entries(notes)) assert.ok(typeof value === 'string' && value.trim().length > 2, `${fdi}: ${key}`)
    const partner = (Math.floor(fdi / 10) % 2 === 1 ? Math.floor(fdi / 10) + 1 : Math.floor(fdi / 10) - 1) * 10 + (fdi % 10)
    assert.equal(toothNotes(partner), notes, `${fdi} and ${partner}`)
  }
  assert.equal(new Set(TEETH.map((t) => toothNotes(t.fdi))).size, 16, 'sixteen kinds')
  assert.deepEqual(NOTE_FACTS.map(([key]) => key).sort(), ['canals', 'cusps', 'eruption', 'roots'])
})

test('the notes say what the textbook says, in plain words', () => {
  assert.match(toothNotes(16).roots, /^Three/)
  assert.match(toothNotes(16).canals, /four/)
  assert.match(toothNotes(46).cusps, /^Five/)
  assert.match(toothNotes(14).roots, /two/i)
  assert.match(toothNotes(13).roots, /longest/)
  assert.match(toothNotes(36).eruption, /6 to 7/)
  assert.throws(() => toothNotes(19), RangeError)
  // No middle dots, arrows or study statistics.
  for (const { fdi } of TEETH) for (const value of Object.values(toothNotes(fdi))) assert.doesNotMatch(value, /[·→←]|\d+\s*(%|of \d+)/)
})
