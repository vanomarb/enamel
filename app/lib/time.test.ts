import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDaysISO, formatClock, isRealDate, manilaTime } from './time.ts'

test('manilaTime converts from UTC', () => {
  assert.deepEqual(manilaTime(new Date(Date.UTC(2026, 10, 18, 16, 30))), { isoDate: '2026-11-19', weekday: 4, minutes: 30 })
})

test('manilaTime reports Sunday as weekday 0, whatever the visitor’s own day is', () => {
  // Saturday 16:05 UTC (still Saturday in London or New York) is Sunday 00:05 in Cebu.
  assert.deepEqual(manilaTime(new Date(Date.UTC(2026, 10, 21, 16, 5))), { isoDate: '2026-11-22', weekday: 0, minutes: 5 })
})

test('formatClock uses 12-hour time', () => {
  assert.equal(formatClock(0), '12:00 AM'); assert.equal(formatClock(465), '7:45 AM'); assert.equal(formatClock(1305), '9:45 PM')
})

test('formatClock handles noon and wraps past midnight', () => {
  assert.equal(formatClock(720), '12:00 PM')
  assert.equal(formatClock(1440 + 465), '7:45 AM')
})

test('addDaysISO crosses months', () => { assert.equal(addDaysISO('2026-11-30', 1), '2026-12-01') })

test('addDaysISO crosses years and goes backwards', () => {
  assert.equal(addDaysISO('2026-12-31', 1), '2027-01-01')
  assert.equal(addDaysISO('2027-03-01', -1), '2027-02-28')
})

test('only dates that exist are real dates', () => {
  for (const good of ['2026-11-20', '2028-02-29', '2026-12-31']) assert.equal(isRealDate(good), true, good)
  for (const bad of ['2026-13-45', '2026-02-30', '2027-02-29', '2026-00-10', '2026-11-00', '2026-1-1', '20261120', '', 'tomorrow']) assert.equal(isRealDate(bad), false, bad)
})
