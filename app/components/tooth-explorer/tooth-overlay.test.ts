import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cullOverlaps, type Box } from './tooth-overlay.ts'

const box = (x: number, y: number, priority: number, w = 20, h = 16): Box => ({ x, y, w, h, priority })

test('overlapping chips: the higher priority stays, the others go, and separate ones are all kept', () => {
  const chosen = box(10, 10, 3)
  const behind = box(18, 14, 1)
  const apart = box(60, 10, 1)
  const kept = cullOverlaps([behind, chosen, apart])
  assert.ok(kept.has(chosen) && kept.has(apart) && !kept.has(behind))
})

test('ties go to the earlier chip, and the gap counts as overlap', () => {
  const first = box(0, 0, 1)
  const second = box(21, 0, 1)
  assert.equal(cullOverlaps([first, second], 2).size, 1, 'one pixel apart is too close with a 2 px gap')
  assert.ok(cullOverlaps([first, second], 2).has(first))
  assert.equal(cullOverlaps([first, second], 0).size, 2)
})

test('a chain of overlaps keeps every other chip, not just the first', () => {
  const row = [0, 15, 30, 45].map((x, i) => box(x, 0, 10 - i))
  const kept = cullOverlaps(row, 0)
  assert.deepEqual(row.map((b) => kept.has(b)), [true, false, true, false])
})
