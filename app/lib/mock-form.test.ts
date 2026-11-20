import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fieldProblem, formProblems } from './mock-form.ts'

test('every empty required field gets its own message, in words', () => {
  const problems = formProblems([
    { name: 'name', required: true, value: ' ' },
    { name: 'reply', required: true, value: '' },
    { name: 'topic', required: false, value: '' },
    { name: 'message', required: true, value: '' },
  ])
  assert.deepEqual(Object.keys(problems), ['name', 'reply', 'message'])
  assert.equal(new Set(Object.values(problems)).size, 3, 'three different messages')
  assert.match(problems.name, /name/i)
  assert.match(problems.reply, /email|mobile/i)
  assert.match(problems.message, /message/i)
})

test('a newsletter address and a reply contact must look right', () => {
  assert.equal(fieldProblem({ name: 'email', required: true, value: 'ana@example.com' }), null)
  assert.match(fieldProblem({ name: 'email', required: true, value: 'ana@' }) ?? '', /email address/i)
  assert.match(fieldProblem({ name: 'email', required: true, value: '' }) ?? '', /email address/i)
  assert.equal(fieldProblem({ name: 'reply', required: true, value: '0917 123 4567' }), null)
  assert.equal(fieldProblem({ name: 'reply', required: true, value: 'ana@example.com' }), null)
  assert.match(fieldProblem({ name: 'reply', required: true, value: '12345' }) ?? '', /mobile/i)
})

test('a filled-in form has no problems, and optional blanks are fine', () => {
  assert.deepEqual(formProblems([{ name: 'name', required: true, value: 'Ana' }, { name: 'topic', required: false, value: '' }]), {})
  assert.equal(fieldProblem({ name: 'other', required: true, value: '' }), 'Fill in this field.')
})
