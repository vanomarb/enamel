import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TEETH, toothName, treatmentsFor } from './teeth.ts'
import { SERVICES } from './services.ts'

test('there are 32 teeth with FDI numbers', () => { assert.equal(TEETH.length, 32) })

test('tooth names read naturally', () => {
  assert.equal(toothName(16), 'Upper right first molar'); assert.equal(toothName(21), 'Upper left central incisor'); assert.equal(toothName(38), 'Lower left wisdom tooth')
})

test('treatments depend on the tooth type', () => {
  assert.ok(treatmentsFor(38).includes('wisdom')); assert.ok(treatmentsFor(16).includes('root-canal-molar')); assert.ok(treatmentsFor(11).includes('root-canal-front'))
  assert.equal(treatmentsFor(11).includes('root-canal-molar'), false)
})

test('FDI numbers run 11 to 18, 21 to 28, 31 to 38 and 41 to 48, once each', () => {
  const expected = [1, 2, 3, 4].flatMap((q) => [1, 2, 3, 4, 5, 6, 7, 8].map((p) => q * 10 + p))
  assert.deepEqual(TEETH.map((t) => t.fdi).sort((a, b) => a - b), expected)
})

test('quadrants map to arch and side', () => {
  const at = (fdi: number) => TEETH.find((t) => t.fdi === fdi)
  assert.deepEqual([at(14)?.arch, at(14)?.side], ['upper', 'right'])
  assert.deepEqual([at(24)?.arch, at(24)?.side], ['upper', 'left'])
  assert.deepEqual([at(34)?.arch, at(34)?.side], ['lower', 'left'])
  assert.deepEqual([at(44)?.arch, at(44)?.side], ['lower', 'right'])
  assert.equal(at(13)?.type, 'canine'); assert.equal(at(45)?.type, 'premolar'); assert.equal(at(28)?.type, 'wisdom')
})

test('every tooth has its own name', () => {
  assert.equal(new Set(TEETH.map((t) => toothName(t.fdi))).size, 32)
})

test('treatments only point at services on the price list', () => {
  const ids = new Set(SERVICES.map((s) => s.id))
  for (const t of TEETH) {
    assert.ok(treatmentsFor(t.fdi).length > 0, `tooth ${t.fdi} has treatments`)
    for (const id of treatmentsFor(t.fdi)) assert.ok(ids.has(id), `${id} is a service`)
  }
})

test('premolars and molars share the back-tooth root canal; wisdom teeth get removal, not fillings', () => {
  assert.ok(treatmentsFor(45).includes('root-canal-molar'))
  assert.equal(treatmentsFor(48).includes('filling'), false)
  assert.ok(treatmentsFor(48).includes('panoramic'))
})

test('numbers that are not teeth are refused', () => {
  assert.throws(() => toothName(19), RangeError)
  assert.throws(() => treatmentsFor(50), RangeError)
})
