import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { closeAll, loadPage } from '../../tests/harness.ts'

after(closeAll)

const STATUS = '[data-mock-form="newsletter"] [data-form-status]'
const CONTACT_STATUS = '[data-mock-form="contact"] [data-form-status]'

function contact() {
  const p = loadPage('contact/index.html', 'contact/')
  assert.deepEqual(p.boot(), [])
  const field = (id: string) => p.$<HTMLInputElement>(`#contact-${id}`)
  const error = (id: string) => p.$(`#contact-${id}-error`)
  return { p, field, error }
}

test('an empty contact form names every missing field in words and puts focus on the first', () => {
  const { p, field, error } = contact()
  p.submit('form[data-mock-form="contact"]')
  assert.equal(error('name').hidden, false)
  assert.equal(error('name').textContent, 'Enter your name.')
  assert.equal(error('reply').textContent, 'Enter an email address or a mobile number so we could reply.')
  assert.equal(error('message').textContent, 'Write your message.')
  for (const id of ['name', 'reply', 'message']) {
    assert.equal(field(id).getAttribute('aria-invalid'), 'true', `${id} is flagged`)
    assert.ok(field(id).getAttribute('aria-describedby')?.split(' ').includes(`contact-${id}-error`), `${id} is tied to its message`)
  }
  assert.equal(p.document.activeElement, field('name'), 'focus goes to the first problem')
  assert.equal(p.text(CONTACT_STATUS), '', 'nothing is said to have been sent')
})

test('a reply address that is neither an email nor a 09 mobile number gets its own message, and it goes as soon as the field is right', () => {
  const { p, field, error } = contact()
  p.type('#contact-name', 'Ana Cruz')
  p.type('#contact-reply', '12345')
  p.type('#contact-message', 'Do you take walk-ins?')
  p.submit('form[data-mock-form="contact"]')
  assert.equal(error('reply').textContent, 'Enter an email address or a mobile number starting with 09.')
  assert.equal(error('name').hidden, true, 'the fields that are fine have no message')
  assert.equal(p.document.activeElement, field('reply'))
  p.type('#contact-reply', '0917 123 4567')
  assert.equal(error('reply').hidden, true, 'the message goes while typing')
  assert.equal(field('reply').hasAttribute('aria-invalid'), false)
  assert.equal(field('reply').hasAttribute('aria-describedby') && field('reply').getAttribute('aria-describedby')!.includes('error'), false)
})

test('a good contact form says plainly that nothing was sent, uses the first name, and empties the form', () => {
  const { p, field } = contact()
  p.type('#contact-name', 'Ana Cruz')
  p.type('#contact-reply', 'ana@example.com')
  p.type('#contact-message', 'Do you take walk-ins?')
  p.submit('form[data-mock-form="contact"]')
  assert.equal(p.text(CONTACT_STATUS), 'Thanks, Ana. This is a demonstration site, so your message wasn’t sent.')
  assert.equal(field('name').value, '')
  assert.equal(field('message').value, '')
})

test('the footer newsletter asks for an address, rejects a bad one, and says nothing was sent or kept for a good one', () => {
  const p = loadPage('contact/index.html', 'contact/')
  assert.deepEqual(p.boot(), [])
  const email = p.$<HTMLInputElement>('#footer-email')
  p.submit('form[data-mock-form="newsletter"]')
  assert.equal(p.$('#footer-email-error').hidden, false)
  assert.equal(p.text('#footer-email-error'), 'Enter your email address.')
  assert.equal(p.document.activeElement, email)
  assert.equal(email.getAttribute('aria-invalid'), 'true')

  p.type('#footer-email', 'nope')
  assert.equal(p.text('#footer-email-error'), 'Enter an email address, like name@example.com.', 'the message follows what is typed')
  p.submit('form[data-mock-form="newsletter"]')
  assert.equal(p.text(STATUS), '')

  p.type('#footer-email', 'ana@example.com')
  assert.equal(p.$('#footer-email-error').hidden, true)
  p.submit('form[data-mock-form="newsletter"]')
  assert.equal(p.text(STATUS), 'Thanks. This is a demonstration site, so your address wasn’t sent or kept.')
  assert.equal(email.value, '', 'the field is emptied')
  assert.equal(p.window.localStorage.length, 0, 'nothing was kept in storage')
})

test('the newsletter works the same on Home', () => {
  const p = loadPage('index.html', '')
  assert.deepEqual(p.boot(), [])
  p.type('#footer-email', 'ana@example.com')
  p.submit('form[data-mock-form="newsletter"]')
  assert.match(p.text(STATUS), /^Thanks\./)
})
