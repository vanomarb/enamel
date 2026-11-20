import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { closeAll, loadPage, type PageOptions } from '../../tests/harness.ts'

after(closeAll)

function page(file = 'treatments/index.html', path = 'treatments/', options: PageOptions = {}) {
  const p = loadPage(file, path, options)
  assert.deepEqual(p.boot(), [], 'starts without errors')
  const button = p.$<HTMLButtonElement>('[data-menu-button]')
  const menu = p.$<HTMLDialogElement>('#site-menu')
  const openMenu = () => {
    button.click()
    assert.equal(menu.open, true, 'the drawer opens')
  }
  return { p, button, menu, openMenu }
}

test('the Menu button opens the drawer with focus on Close, and Escape closes it and puts focus back on Menu', () => {
  const { p, button, menu, openMenu } = page()
  assert.equal(button.getAttribute('aria-controls'), 'site-menu')
  assert.equal(button.getAttribute('aria-expanded'), 'false')
  assert.equal(button.textContent?.replace(/\s+/g, ' ').trim(), 'Menu')
  assert.equal(menu.open, false, 'closed until asked')

  button.focus()
  openMenu()
  assert.equal(button.getAttribute('aria-expanded'), 'true')
  assert.equal(p.document.activeElement, p.$('[data-menu-close]'), 'focus moves in, to Close, where Menu was')
  assert.equal(button.textContent?.replace(/\s+/g, ' ').trim(), 'Menu', 'the button keeps its name while the drawer is open')

  p.key('Escape')
  assert.equal(menu.open, false, 'Escape closes it')
  assert.equal(button.getAttribute('aria-expanded'), 'false')
  assert.equal(p.document.activeElement, button, 'focus is back on Menu')
})

test('the Close button closes the drawer and focus goes back to Menu', () => {
  const { p, button, menu, openMenu } = page()
  button.focus()
  openMenu()
  p.click('[data-menu-close]')
  assert.equal(menu.open, false)
  assert.equal(button.getAttribute('aria-expanded'), 'false')
  assert.equal(p.document.activeElement, button)
})

test('a tap on the scrim closes the drawer, a tap inside it does not', () => {
  const { p, button, menu, openMenu } = page()
  button.focus()
  openMenu()
  p.click('[data-today-hours]')
  p.click(menu.querySelector('nav')!)
  assert.equal(menu.open, true, 'taps on the drawer’s own content leave it open')
  p.click(menu) // the content fills the dialog, so a click whose target is the dialog itself is the scrim
  assert.equal(menu.open, false, 'the scrim closes it')
  assert.equal(p.document.activeElement, button, 'focus is back on Menu')
})

test('choosing a link closes the drawer, and it opens again afterwards', () => {
  const { p, button, menu, openMenu } = page()
  button.focus()
  openMenu()
  p.click('#site-menu a[data-page="team"]')
  assert.equal(menu.open, false)
  assert.equal(p.document.activeElement, button)
  openMenu()
  assert.equal(button.getAttribute('aria-expanded'), 'true')
})

test('widening the window past the breakpoint closes an open drawer', () => {
  const { p, button, menu, openMenu } = page()
  button.focus()
  openMenu()
  p.resize(true)
  assert.equal(menu.open, false)
  assert.equal(button.getAttribute('aria-expanded'), 'false')
})

test('the drawer lists the pages, marks the current one, and shows today’s hours in Cebu time', () => {
  const { p, openMenu } = page('team/index.html', 'team/')
  openMenu()
  const links = p.$$<HTMLAnchorElement>('#site-menu nav a')
  assert.deepEqual(links.map((a) => a.textContent?.trim()), ['Treatments', 'New patients', 'Dentists and hours', 'Sign in'])
  assert.deepEqual(links.filter((a) => a.getAttribute('aria-current') === 'page').map((a) => a.dataset.page), ['team'])
  assert.equal(p.text('[data-today-label]'), 'Today, Monday')
  assert.equal(p.text('[data-today-hours]'), '9:00 AM to 6:00 PM')
  assert.equal(p.text('[data-today-note]'), 'No appointments from 12:00 PM to 1:00 PM.')
  const book = p.$<HTMLAnchorElement>('#site-menu a.button')
  assert.equal(book.textContent?.trim(), 'Book a visit')
  assert.equal(book.getAttribute('href'), '/enamel/book/')
})

test('the drawer’s hours follow the day: Saturday has the orthodontist, Sunday is closed', () => {
  // 2026-11-21 is a Saturday and 2026-11-22 a Sunday in Cebu.
  const saturday = page('index.html', '', { now: '2026-11-21T03:00:00Z' })
  saturday.openMenu()
  assert.equal(saturday.p.text('[data-today-label]'), 'Today, Saturday')
  assert.equal(saturday.p.text('[data-today-note]'), 'The orthodontist is in today.')
  const sunday = page('index.html', '', { now: '2026-11-22T03:00:00Z' })
  sunday.openMenu()
  assert.equal(sunday.p.text('[data-today-label]'), 'Today, Sunday')
  assert.equal(sunday.p.text('[data-today-hours]'), 'Closed')
  assert.equal(sunday.p.text('[data-today-note]'), 'Open again Monday at 9:00 AM.')
})

test('About this site opens the dialog with focus on Close; Escape, Close and the backdrop close it, and focus goes back', () => {
  const p = loadPage('index.html', '')
  assert.deepEqual(p.boot(), [])
  const dialog = p.$<HTMLDialogElement>('#concept-dialog')
  const opener = p.$<HTMLButtonElement>('[data-hero-action] [data-concept]')
  assert.equal(dialog.open, false)

  opener.focus()
  p.click(opener)
  assert.equal(dialog.open, true)
  assert.equal(p.document.activeElement, p.$('[data-concept-close]'), 'focus on Close')
  p.key('Escape')
  assert.equal(dialog.open, false)
  assert.equal(p.document.activeElement, opener, 'Escape returns focus to the opener')

  p.click(opener)
  p.click('[data-concept-close]')
  assert.equal(dialog.open, false, 'Close closes it')
  assert.equal(p.document.activeElement, opener)

  p.click(opener)
  p.click(dialog.querySelector('h2')!)
  assert.equal(dialog.open, true, 'a click on its content leaves it open')
  p.click(dialog) // the backdrop: a click whose target is the dialog itself
  assert.equal(dialog.open, false, 'the backdrop closes it')
  assert.equal(p.document.activeElement, opener)
})

test('the footer’s About this site opens the same dialog and returns focus to itself', () => {
  const p = loadPage('contact/index.html', 'contact/')
  assert.deepEqual(p.boot(), [])
  const link = p.$<HTMLButtonElement>('footer [data-concept]')
  link.focus()
  p.click(link)
  assert.equal(p.$<HTMLDialogElement>('#concept-dialog').open, true)
  p.key('Escape')
  assert.equal(p.document.activeElement, link)
})

test('signed in, the header shows the first name and labels both account links for screen readers; signed out, neither', () => {
  const session = { firstName: 'Ana Cruz', contact: { kind: 'email', value: 'ana@example.com' } }
  const signedIn = loadPage('team/index.html', 'team/', { storage: { 'enamel.account': session } })
  assert.deepEqual(signedIn.boot(), [])
  assert.ok(signedIn.document.documentElement.hasAttribute('data-signed-in'), 'marked before the script runs')
  assert.equal(signedIn.document.documentElement.style.getPropertyValue('--account-name'), '"Ana"')
  const labels = signedIn.$$('[data-header] a[data-page="account"]').map((a) => a.getAttribute('aria-label'))
  assert.deepEqual(labels, ['Account, signed in as Ana', 'Account, signed in as Ana'], 'the inline link and the drawer link')

  const out = loadPage('team/index.html', 'team/')
  assert.deepEqual(out.boot(), [])
  assert.equal(out.document.documentElement.hasAttribute('data-signed-in'), false)
  assert.deepEqual(out.$$('[data-header] a[data-page="account"]').map((a) => a.getAttribute('aria-label')), [null, null])
})

test('a damaged sign-in in storage is treated as signed out', () => {
  const p = loadPage('team/index.html', 'team/', { storage: { 'enamel.account': '{"firstName":' } })
  assert.deepEqual(p.boot(), [])
  assert.equal(p.document.documentElement.hasAttribute('data-signed-in'), false)
})
