import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TEETH } from './teeth.ts'
import {
  NUMBERING_LABEL,
  NUMBERING_SHORT,
  NUMBERING_SYSTEMS,
  chartNumber,
  fdiToPalmer,
  fdiToUniversal,
  formatTooth,
  isNumberingSystem,
  palmerToFdi,
  spokenTooth,
  universalToFdi,
} from './notation.ts'

test('all 32 teeth go to Universal and Palmer and back to the same FDI number', () => {
  for (const { fdi } of TEETH) {
    assert.equal(universalToFdi(fdiToUniversal(fdi)), fdi, `${fdi} through Universal`)
    assert.equal(palmerToFdi(fdiToPalmer(fdi)), fdi, `${fdi} through Palmer`)
  }
  assert.deepEqual(TEETH.map((t) => fdiToUniversal(t.fdi)).sort((a, b) => a - b), Array.from({ length: 32 }, (_, i) => i + 1), 'Universal uses 1 to 32 once each')
  assert.equal(new Set(TEETH.map((t) => fdiToPalmer(t.fdi))).size, 32, 'no two teeth share a Palmer number')
})

test('Universal starts at the upper right third molar and ends at the lower right one', () => {
  const corners: [number, number][] = [[11, 8], [18, 1], [21, 9], [28, 16], [38, 17], [31, 24], [41, 25], [48, 32]]
  for (const [fdi, universal] of corners) {
    assert.equal(fdiToUniversal(fdi), universal, `FDI ${fdi} is Universal ${universal}`)
    assert.equal(universalToFdi(universal), fdi, `Universal ${universal} is FDI ${fdi}`)
  }
})

test('Palmer writes the quadrant as UR, UL, LL or LR, then the place from the midline', () => {
  assert.equal(fdiToPalmer(16), 'UR6')
  assert.equal(fdiToPalmer(24), 'UL4')
  assert.equal(fdiToPalmer(38), 'LL8')
  assert.equal(fdiToPalmer(41), 'LR1')
  assert.equal(palmerToFdi('UR6'), 16)
  assert.equal(palmerToFdi(' ul 4 '), 24, 'any case, with spaces')
  assert.equal(palmerToFdi('LL8'), 38)
  assert.equal(palmerToFdi('lr1'), 41)
  for (const bad of ['', 'UR9', 'UR0', 'RU6', 'XX1', 'UR', '16']) assert.equal(palmerToFdi(bad), null, `"${bad}" is not Palmer`)
})

test('numbers that are not adult teeth are refused', () => {
  for (const fdi of [0, 10, 19, 51, 16.5]) assert.throws(() => fdiToUniversal(fdi), RangeError, `FDI ${fdi}`)
  assert.throws(() => fdiToPalmer(49), RangeError)
  for (const universal of [0, 33, 2.5]) assert.throws(() => universalToFdi(universal), RangeError, `Universal ${universal}`)
  assert.throws(() => formatTooth(9, 'fdi'), RangeError)
  assert.throws(() => chartNumber(59, 'palmer'), RangeError)
  assert.throws(() => spokenTooth(19, 'fdi'), RangeError)
})

test('each system has a written form, a chart form and a spoken form', () => {
  assert.deepEqual(NUMBERING_SYSTEMS.map((s) => formatTooth(16, s)), ['16', '#3', 'UR6'])
  assert.deepEqual(NUMBERING_SYSTEMS.map((s) => chartNumber(16, s)), ['16', '3', '6'], 'the chart drops Palmer’s quadrant')
  assert.deepEqual(NUMBERING_SYSTEMS.map((s) => spokenTooth(16, s)), ['tooth 16', 'tooth number 3', 'upper right 6'])
  assert.deepEqual(NUMBERING_SYSTEMS.map((s) => spokenTooth(34, s)), ['tooth 34', 'tooth number 21', 'lower left 4'])
  assert.deepEqual(NUMBERING_SYSTEMS.map((s) => [NUMBERING_SHORT[s], NUMBERING_LABEL[s]]), [['FDI', 'FDI'], ['UNI', 'Universal'], ['PAL', 'Palmer']])
})

test('only the three system names count as a numbering system', () => {
  for (const system of NUMBERING_SYSTEMS) assert.ok(isNumberingSystem(system))
  for (const other of ['FDI', 'ada', '', null, undefined, 3]) assert.equal(isNumberingSystem(other), false, String(other))
})
