import { test } from 'node:test'
import assert from 'node:assert/strict'
import { escapeHtml, peso } from './format.ts'

test('peso formats without decimals', () => {
  assert.equal(peso(85), '₱85'); assert.equal(peso(1290), '₱1,290'); assert.equal(peso(45000), '₱45,000')
})

test('escapeHtml makes typed text safe to show', () => {
  assert.equal(escapeHtml(`<b>Ana & "Jo" O'Neil</b>`), '&lt;b&gt;Ana &amp; &quot;Jo&quot; O&#39;Neil&lt;/b&gt;')
  assert.equal(escapeHtml('Ana Reyes'), 'Ana Reyes')
})
