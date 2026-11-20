import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { closeAll, loadPage, type Page } from '../../tests/harness.ts'
import { ACCOUNT_KEY, APPOINTMENTS_KEY, type Appointment } from '../lib/account.ts'

/* "Now" is Monday 16 November 2026, 8:30 AM in Cebu, so an appointment on the 18th is upcoming and one on the 10th past. */

after(closeAll)

const SESSION = { firstName: 'Ana Cruz', contact: { kind: 'email', value: 'ana@example.com' } }
const visit = (id: string, serviceId: string, day: string, start: number, extra: Partial<Appointment> = {}): Appointment => ({
  id,
  serviceId,
  dentistId: 'general-1',
  day,
  start,
  patient: 'Ana Cruz',
  hmo: '',
  ...extra,
})

function account(storage: Record<string, unknown> = {}) {
  const p = loadPage('account/index.html', 'account/', { storage })
  assert.deepEqual(p.boot(), [], 'starts without errors')
  return p
}

const signedIn = (p: Page) => p.document.documentElement.hasAttribute('data-signed-in')
const visible = (el: Element) => !(el as HTMLElement).hidden
const signIn = (p: Page, name = 'Ana Cruz', contact = 'ana@example.com') => {
  p.type('#signin-name', name)
  p.type('#signin-contact', contact)
  p.submit('form[data-signin="contact"]')
}
const shownCode = (p: Page) => p.text('[data-demo-code]')

test('signed out, the page opens on step 1 with the contact form and no code form', () => {
  const p = account()
  assert.equal(signedIn(p), false)
  assert.equal(visible(p.$('form[data-signin="contact"]')), true)
  assert.equal(visible(p.$('form[data-signin="code"]')), false)
  assert.equal(p.$('[data-signin-step="contact"]').getAttribute('aria-current'), 'step')
  assert.equal(p.text('[data-signin="contact"] button[type="submit"]'), 'Show my code')
})

test('step 1 names what is wrong, and focus goes to the first field that is', () => {
  const p = account()
  p.submit('form[data-signin="contact"]')
  assert.equal(p.text('#signin-name-error'), 'Enter your first name.')
  assert.equal(p.text('#signin-contact-error'), 'Enter your email address or mobile number.')
  assert.equal(p.document.activeElement, p.$('#signin-name'))
  assert.equal(p.$('#signin-contact').getAttribute('aria-invalid'), 'true')
  assert.ok(p.$('#signin-contact').getAttribute('aria-describedby')!.includes('signin-contact-error'), 'tied to its message, beside the hint')

  p.type('#signin-name', 'Ana')
  p.type('#signin-contact', '1234')
  p.submit('form[data-signin="contact"]')
  assert.equal(p.$('#signin-name-error').hidden, true, 'a good name has no message')
  assert.equal(p.text('#signin-contact-error'), 'Enter an email address, or a mobile number that starts with 09.')
  assert.equal(p.document.activeElement, p.$('#signin-contact'))
  assert.equal(visible(p.$('form[data-signin="code"]')), false, 'no code until step 1 is right')
})

test('a good step 1 shows the code and puts focus in the code field; the first step folds to one line with Change', () => {
  const p = account()
  signIn(p)
  assert.equal(visible(p.$('form[data-signin="contact"]')), false)
  assert.equal(visible(p.$('form[data-signin="code"]')), true)
  assert.equal(p.document.activeElement, p.$('#signin-code'), 'the code field takes focus')
  assert.match(shownCode(p), /^\d{4}$/, 'a four-digit code is shown on screen')
  assert.equal(p.text('[data-code-contact]'), 'a••@example.com')
  assert.equal(p.text('[data-signin-summary]'), 'Ana, with a••@example.com')
  assert.ok(p.$('[data-signin-step="contact"]').classList.contains('is-done'))
  assert.equal(p.$('[data-signin-step="code"]').getAttribute('aria-current'), 'step')
  assert.equal(p.$('#signin-code').getAttribute('aria-describedby'), 'signin-code-demo', 'the code is read out with the field')
  assert.equal(p.window.localStorage.getItem(ACCOUNT_KEY), null, 'not signed in yet')
})

test('a mobile number starting with 09 is accepted and shown masked', () => {
  const p = account()
  signIn(p, 'Ben', '0917 123 4567')
  assert.equal(p.text('[data-code-contact]'), '0917 ••• 4567')
})

test('Change goes back to step 1 with what was typed still there, and focus on the contact field', () => {
  const p = account()
  signIn(p)
  p.click('[data-signin-back]')
  assert.equal(visible(p.$('form[data-signin="contact"]')), true)
  assert.equal(visible(p.$('form[data-signin="code"]')), false)
  assert.equal(p.$<HTMLInputElement>('#signin-name').value, 'Ana Cruz')
  assert.equal(p.$<HTMLInputElement>('#signin-contact').value, 'ana@example.com')
  assert.equal(p.document.activeElement, p.$('#signin-contact'))
})

test('a wrong or empty code is refused in words; the right one signs in, greets by name and keeps the session', async () => {
  const p = account()
  signIn(p)
  p.submit('form[data-signin="code"]')
  assert.equal(p.text('#signin-code-error'), 'Enter the four digits shown above.')
  assert.equal(p.document.activeElement, p.$('#signin-code'))
  const wrong = String(Number(shownCode(p)) === 1234 ? 4321 : 1234)
  p.type('#signin-code', wrong)
  p.submit('form[data-signin="code"]')
  assert.equal(p.text('#signin-code-error'), 'That isn’t the code shown above. Check the four digits and try again.')
  assert.equal(signedIn(p), false)

  p.type('#signin-code', shownCode(p))
  p.submit('form[data-signin="code"]')
  assert.equal(signedIn(p), true)
  assert.equal(p.document.documentElement.style.getPropertyValue('--account-name'), '"Ana"', 'the header shows the first name')
  assert.equal(p.text('#account-greeting'), 'Welcome, Ana Cruz')
  assert.equal(p.document.activeElement, p.$('#account-greeting'), 'focus goes to the greeting')
  assert.equal(p.text('[data-account-contact]'), 'Signed in with a••@example.com')
  assert.deepEqual(p.storage(ACCOUNT_KEY), { firstName: 'Ana Cruz', contact: { kind: 'email', value: 'ana@example.com' } })
  assert.deepEqual(p.$$('[data-header] a[data-page="account"]').map((a) => a.getAttribute('aria-label')), ['Account, signed in as Ana', 'Account, signed in as Ana'])
  await p.wait(120)
  assert.equal(p.text('[data-account-status]'), 'Signed in.')
  assert.equal(p.$('[data-appointments-empty]').hidden, false, 'no visits yet')
})

test('a signed-in visitor sees upcoming visits soonest first and past visits below as a record', () => {
  const p = account({
    [ACCOUNT_KEY]: SESSION,
    [APPOINTMENTS_KEY]: [visit('later', 'filling', '2026-11-20', 840), visit('past', 'checkup', '2026-11-10', 600), visit('soon', 'cleaning', '2026-11-18', 600, { hmo: 'Maxicare' })],
  })
  assert.equal(signedIn(p), true)
  assert.equal(p.text('#account-greeting'), 'Welcome, Ana Cruz')
  const upcoming = p.$$('[data-appointments] > li')
  assert.deepEqual(upcoming.map((li) => li.querySelector('details')!.dataset.appointment), ['soon', 'later'])
  assert.match(upcoming[0].querySelector('summary')!.textContent!, /Cleaning.*Wednesday, November 18, 2026, 10:00 AM/s)
  assert.match(upcoming[1].querySelector('summary')!.textContent!, /Tooth-coloured filling.*Friday, November 20, 2026, 2:00 PM/s)
  assert.equal(p.$('[data-appointments-empty]').hidden, true)

  const first = upcoming[0].textContent!.replace(/\s+/g, ' ')
  assert.ok(first.includes('₱1,000') && first.includes('General dentist, chair 1') && first.includes('Maxicare'))
  assert.ok(first.includes('HMO checklist for this visit') && first.includes('Six-month reminder, previewed'))
  assert.ok(first.includes('A real clinic would send this on Tuesday, May 18, 2027.'))
  assert.equal(upcoming[0].querySelector('a')!.getAttribute('href'), '/enamel/book/?service=cleaning&reschedule=soon')
  assert.ok(upcoming[0].querySelector('[data-cancel="soon"]'))
  assert.ok(upcoming[1].textContent!.includes('₱1,200 per surface'), 'the filling’s price with its unit')

  const past = p.$$('[data-appointments-past] > li')
  assert.equal(past.length, 1)
  assert.equal(p.$('[data-past]').hidden, false)
  assert.ok(past[0].textContent!.includes('Check-up and consultation'))
  assert.equal(past[0].querySelector('[data-cancel]'), null, 'a past visit has no Cancel')
  assert.equal(past[0].querySelector('a'), null, 'and no Reschedule')
  assert.ok(!past[0].textContent!.includes('Six-month reminder'))
})

test('Cancel asks first, Keep puts focus back on Cancel, and Yes removes the visit from the list and storage', async () => {
  const p = account({ [ACCOUNT_KEY]: SESSION, [APPOINTMENTS_KEY]: [visit('a', 'cleaning', '2026-11-18', 600), visit('b', 'checkup', '2026-11-19', 600)] })
  const cancel = p.$<HTMLButtonElement>('[data-cancel="a"]')
  const confirm = cancel.closest('details')!.querySelector<HTMLElement>('[data-cancel-confirm]')!
  assert.equal(confirm.hidden, true)
  p.click(cancel)
  assert.equal(confirm.hidden, false)
  assert.equal(p.document.activeElement, confirm.querySelector('p'), 'focus goes to the question')
  assert.equal(confirm.querySelector('p')!.textContent, 'Cancel this appointment?')

  p.click(confirm.querySelector('[data-cancel-keep]')!)
  assert.equal(confirm.hidden, true)
  assert.equal(p.document.activeElement, cancel)
  assert.equal(p.$$('[data-appointments] > li').length, 2, 'nothing removed')

  p.click(cancel)
  p.click('[data-cancel-yes="a"]')
  assert.deepEqual(p.$$('[data-appointments] > li details').map((d) => d.getAttribute('data-appointment')), ['b'])
  assert.deepEqual((p.storage(APPOINTMENTS_KEY) as Appointment[]).map((a) => a.id), ['b'])
  assert.equal(p.document.activeElement, p.$('#account-greeting'))
  await p.wait(120)
  assert.equal(p.text('[data-account-status]'), 'Appointment cancelled. This is a demonstration site, so nothing was sent.')
})

test('Sign out returns to step 1 with focus on the first name, and keeps the appointments on the device', async () => {
  const p = account({ [ACCOUNT_KEY]: SESSION, [APPOINTMENTS_KEY]: [visit('a', 'cleaning', '2026-11-18', 600)] })
  p.click('[data-signout]')
  assert.equal(signedIn(p), false)
  assert.equal(p.window.localStorage.getItem(ACCOUNT_KEY), null)
  assert.ok(p.window.localStorage.getItem(APPOINTMENTS_KEY), 'the appointments are not part of signing out')
  assert.equal(p.$('[data-appointments]').children.length, 0, 'and are no longer on screen')
  assert.equal(p.document.activeElement, p.$('#signin-name'))
  assert.equal(p.$('[data-removed]').hidden, true)
  await p.wait(120)
  assert.equal(p.text('[data-account-status]'), 'Signed out.')
})

test('Remove everything saved here asks first, says what goes and that it cannot be undone, and Keep changes nothing', () => {
  const p = account({ [ACCOUNT_KEY]: SESSION, [APPOINTMENTS_KEY]: [visit('a', 'cleaning', '2026-11-18', 600)] })
  const wipe = p.$<HTMLButtonElement>('[data-wipe]')
  const confirm = p.$('[data-wipe-confirm]')
  assert.equal(wipe.textContent!.trim(), 'Remove everything saved here')
  assert.equal(confirm.hidden, true)
  p.click(wipe)
  assert.equal(confirm.hidden, false)
  assert.equal(p.document.activeElement, p.$('#wipe-title'), 'focus goes to the question')
  const said = confirm.textContent!.replace(/\s+/g, ' ')
  for (const part of ['appointments', 'past visits', 'sign-in', 'newsletter sign-up', 'can’t be undone']) assert.ok(said.includes(part), `says: ${part}`)
  assert.deepEqual(p.$$('[data-wipe-confirm] button').map((b) => b.textContent!.trim()), ['Remove everything saved here', 'Keep it'])

  p.click('[data-wipe-keep]')
  assert.equal(confirm.hidden, true)
  assert.equal(p.document.activeElement, wipe, 'focus goes back to the button that asked')
  assert.ok(p.window.localStorage.getItem(ACCOUNT_KEY) && p.window.localStorage.getItem(APPOINTMENTS_KEY), 'nothing was removed')
  assert.equal(signedIn(p), true)
})

test('Remove clears every Enamel key (and only those), signs out, empties the lists and says so', async () => {
  const p = account({
    [ACCOUNT_KEY]: SESSION,
    [APPOINTMENTS_KEY]: [visit('a', 'cleaning', '2026-11-18', 600), visit('old', 'checkup', '2026-11-10', 600)],
    'enamel.newsletter': 'a@example.com',
    'another-site.setting': 'keep me',
  })
  assert.equal(p.$$('[data-appointments-past] > li').length, 1)
  p.click('[data-wipe]')
  p.click('[data-wipe-yes]')

  assert.equal(p.window.localStorage.getItem(ACCOUNT_KEY), null)
  assert.equal(p.window.localStorage.getItem(APPOINTMENTS_KEY), null)
  assert.equal(p.window.localStorage.getItem('enamel.newsletter'), null, 'every enamel. key goes, not just the two known ones')
  assert.equal(p.window.localStorage.getItem('another-site.setting'), 'keep me', 'nothing else is touched')
  assert.equal(signedIn(p), false)
  assert.equal(p.document.documentElement.style.getPropertyValue('--account-name'), '', 'the header is signed out')
  assert.equal(p.$('[data-appointments]').children.length, 0)
  assert.equal(p.$('[data-appointments-past]').children.length, 0)
  assert.equal(p.$('[data-past]').hidden, true)
  assert.equal(p.$('[data-wipe-confirm]').hidden, true)
  assert.equal(p.$('[data-removed]').hidden, false, 'a visible line says it is done')
  assert.match(p.text('[data-removed]'), /^Removed\. Enamel has nothing left in this browser/)
  assert.equal(p.document.activeElement, p.$('#signin-name'), 'focus lands on the sign-in form')
  assert.equal(visible(p.$('form[data-signin="contact"]')), true)
  await p.wait(120)
  assert.match(p.text('[data-account-status]'), /^Removed\. Everything this site kept in your browser is gone/)

  // The line goes once someone signs in again.
  signIn(p)
  p.type('#signin-code', shownCode(p))
  p.submit('form[data-signin="code"]')
  assert.equal(p.$('[data-removed]').hidden, true)
  assert.equal(signedIn(p), true)
})

test('with storage blocked, sign-in still works until the page is left, and Remove everything does not fail', async () => {
  const p = loadPage('account/index.html', 'account/')
  // Stand-in: a browser that refuses to keep site data.
  const refuse = () => {
    throw new p.window.DOMException('blocked', 'SecurityError')
  }
  Object.defineProperty(p.window, 'localStorage', { get: refuse, configurable: true })
  assert.deepEqual(p.boot(), [])
  signIn(p)
  p.type('#signin-code', shownCode(p))
  p.submit('form[data-signin="code"]')
  assert.equal(signedIn(p), true)
  await p.wait(120)
  assert.match(p.text('[data-account-status]'), /^Signed in\. Your browser isn’t keeping site data/)
  p.click('[data-wipe]')
  p.click('[data-wipe-yes]')
  assert.equal(signedIn(p), false)
})
