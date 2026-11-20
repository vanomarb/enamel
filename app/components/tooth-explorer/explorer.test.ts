import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { closeAll, loadPage } from '../../../tests/harness.ts'
import { toothName, treatmentsFor } from '../../lib/teeth.ts'
import { priceWithUnit, serviceById, SERVICES, COMMON_SERVICES } from '../../lib/services.ts'
import { durationLabel } from '../../lib/services.ts'

after(closeAll)

const PAGES = [
  { name: 'Treatments', file: 'treatments/index.html', path: 'treatments/' },
  { name: 'Home', file: 'index.html', path: '' },
] as const

for (const { name, file, path } of PAGES) {
  const explorer = () => {
    const p = loadPage(file, path)
    assert.deepEqual(p.boot(), [], 'starts without errors')
    const tooth = (fdi: number) => p.$<SVGGElement>(`.tooth[data-fdi="${fdi}"]`)
    return { p, tooth }
  }

  test(`${name}: the chart gets its roles, one tab stop, and no tooth is chosen until asked`, () => {
    const { p, tooth } = explorer()
    assert.equal(p.$$('[data-tooth-explorer]').length, 1)
    const teeth = p.$$('.tooth')
    assert.equal(teeth.length, 32)
    assert.ok(teeth.every((t) => t.getAttribute('role') === 'button' && t.getAttribute('aria-pressed') === 'false'))
    assert.deepEqual(teeth.filter((t) => t.getAttribute('tabindex') === '0').map((t) => t.dataset.fdi), ['11'], 'one tab stop, at the front')
    assert.equal(p.text('[data-panel] [data-empty] h3'), 'No tooth chosen yet')
    assert.equal(p.$$('[data-panel] [data-tooth-name]').length, 0, 'no detail yet')
    assert.equal(tooth(16).getAttribute('aria-label'), 'Upper right first molar, tooth 16')
  })

  test(`${name}: clicking a tooth shows its name, its usual treatments and their prices, with a link to book each`, () => {
    const { p, tooth } = explorer()
    p.click(tooth(16))
    assert.equal(tooth(16).getAttribute('aria-pressed'), 'true')
    assert.equal(tooth(16).getAttribute('tabindex'), '0')
    assert.equal(p.text('[data-panel] [data-tooth-name]'), toothName(16))
    assert.match(p.text('[data-explorer-status]'), new RegExp(`^${toothName(16)}\\. ${treatmentsFor(16).length} usual treatments\\.$`))
    const rows = p.$$('[data-panel] ul > li')
    assert.equal(rows.length, treatmentsFor(16).length)
    treatmentsFor(16).forEach((id, i) => {
      const service = serviceById(id)!
      const row = rows[i].textContent!.replace(/\s+/g, ' ')
      assert.ok(row.includes(service.name), `${id}: name`)
      assert.ok(row.includes(`starts at ${priceWithUnit(service)}`), `${id}: price ${priceWithUnit(service)}`)
      assert.ok(row.includes(durationLabel(service)), `${id}: time`)
      assert.equal(rows[i].querySelector('a')!.getAttribute('href'), `/enamel/book/?service=${id}`, `${id}: Book this`)
    })
    // The filling is priced per surface, and that unit is on the page with the price.
    assert.ok(p.text('[data-panel]').includes('₱1,200 per surface'))
  })

  test(`${name}: the arrow keys move along the teeth, Enter chooses, and up and down switch arches`, () => {
    const { p, tooth } = explorer()
    tooth(11).focus()
    assert.equal(p.document.activeElement, tooth(11))
    p.key('ArrowRight')
    assert.equal(p.document.activeElement, tooth(21), 'right goes to the next tooth in the row')
    assert.equal(tooth(21).getAttribute('tabindex'), '0')
    assert.equal(tooth(11).getAttribute('tabindex'), '-1', 'the tab stop follows focus')
    p.key('ArrowLeft')
    p.key('ArrowLeft')
    assert.equal(p.document.activeElement, tooth(12))
    p.key('Home')
    assert.equal(p.document.activeElement, tooth(18))
    p.key('End')
    assert.equal(p.document.activeElement, tooth(28))
    p.key('ArrowDown')
    assert.equal(p.document.activeElement, tooth(38), 'down is the tooth below')
    assert.equal(p.$('[data-tooth-explorer]').dataset.arch, 'lower')
    p.key('ArrowUp')
    assert.equal(p.document.activeElement, tooth(28))
    assert.equal(p.$('[data-tooth-explorer]').dataset.arch, 'upper')

    p.key('Enter')
    assert.equal(tooth(28).getAttribute('aria-pressed'), 'true', 'Enter chooses the focused tooth')
    assert.equal(p.text('[data-panel] [data-tooth-name]'), toothName(28))
    assert.equal(p.$$('[data-panel] ul > li').length, treatmentsFor(28).length)
    p.key('ArrowLeft')
    p.key(' ')
    assert.equal(tooth(27).getAttribute('aria-pressed'), 'true', 'Space chooses too')
    assert.equal(tooth(28).getAttribute('aria-pressed'), 'false', 'only one tooth is chosen')
    assert.equal(p.$$('[data-fdi][aria-pressed="true"]').length, 2, 'the tooth and its twin in the phone list')
  })

  test(`${name}: choosing from the list (phones) shows the same detail and puts focus on the tooth’s name`, () => {
    const { p, tooth } = explorer()
    p.click('[data-arch-toggle] [data-arch="lower"]')
    assert.equal(p.$('[data-tooth-explorer]').dataset.arch, 'lower')
    assert.equal(p.$('[data-arch-toggle] [data-arch="lower"]').getAttribute('aria-pressed'), 'true')
    assert.equal(p.$('[data-arch-toggle] [data-arch="upper"]').getAttribute('aria-pressed'), 'false')
    assert.equal(p.$$('.tooth').filter((t) => t.getAttribute('tabindex') === '0').map((t) => t.dataset.fdi).join(), '41', 'the tab stop moves into the arch shown')
    p.click('[data-tooth-list] button[data-fdi="48"]')
    assert.equal(p.text('[data-panel] [data-tooth-name]'), toothName(48))
    assert.equal(p.document.activeElement, p.$('[data-panel] [data-tooth-name]'), 'focus goes to the tooth’s name')
    assert.equal(tooth(48).getAttribute('aria-pressed'), 'true')
    // A wisdom tooth: the panoramic X-ray and the wisdom removal, priced from SERVICES.
    const text = p.text('[data-panel]')
    for (const id of ['panoramic', 'wisdom']) assert.ok(text.includes(priceWithUnit(serviceById(id)!)), id)
  })
}

test('Home and Treatments draw the chart from the same partial: the same markup in both', () => {
  const home = loadPage('index.html', '')
  const treatments = loadPage('treatments/index.html', 'treatments/')
  assert.equal(home.$('[data-tooth-explorer]').outerHTML, treatments.$('[data-tooth-explorer]').outerHTML)
})

test('Home’s price card lists the everyday treatments, each row a link that books it, with its time and starting price', () => {
  const p = loadPage('index.html', '')
  assert.deepEqual(p.boot(), [])
  const rows = p.$$('[data-price-card] > li')
  assert.equal(rows.length, COMMON_SERVICES.length)
  rows.forEach((row, i) => {
    const service = serviceById(COMMON_SERVICES[i])!
    const text = row.textContent!.replace(/\s+/g, ' ')
    assert.ok(text.includes(service.name), `${service.id}: name`)
    assert.ok(text.includes(durationLabel(service)), `${service.id}: time`)
    assert.ok(text.includes(priceWithUnit(service)), `${service.id}: price`)
    assert.ok(row.classList.contains('border-b'), `${service.id}: the divider is on the li`)
    assert.equal(row.querySelector('a')!.getAttribute('href'), `/enamel/book/?service=${service.id}`)
  })
})

test('Home has the chart once, with its section heading, and no sign-in form or numbered steps', () => {
  const p = loadPage('index.html', '')
  assert.deepEqual(p.boot(), [])
  assert.equal(p.$$('[data-tooth-explorer]').length, 1)
  assert.equal(p.text('#chart-title'), 'Show us where it hurts')
  assert.equal(p.$$('[data-signin], [data-booking], ol').length, 0)
})

// jsdom doesn't apply the CSS filter (:has), so these tests check the announced count.
test('Treatments: choosing a chip announces how many treatments it shows, and All brings them all back', () => {
  const p = loadPage('treatments/index.html', 'treatments/')
  assert.deepEqual(p.boot(), [])
  assert.equal(p.$$('[data-service]').length, SERVICES.length)
  assert.equal(p.$('[data-services]').hasAttribute('data-filtering'), false)
  const chip = (value: string) => p.$<HTMLInputElement>(`input[name="service-filter"][value="${value}"]`)
  assert.equal(chip('all').checked, true)

  p.click(chip('restorative'))
  const restorative = SERVICES.filter((s) => s.group === 'restorative').length
  assert.equal(chip('restorative').checked, true)
  assert.equal(chip('all').checked, false, 'one chip at a time')
  assert.equal(p.text('[data-filter-status]'), `Showing ${restorative} in Restorative`)
  assert.ok(p.$('[data-services]').hasAttribute('data-filtering'))
  assert.equal(p.$$(`[data-group="restorative"] [data-service]`).length, restorative)

  p.click(chip('cosmetic'))
  assert.equal(p.text('[data-filter-status]'), 'Showing 1 in Cosmetic')
  p.click(chip('all'))
  assert.equal(p.text('[data-filter-status]'), `Showing all ${SERVICES.length} treatments`)
})

test('Treatments: every price row opens to its details and carries its starting price', () => {
  const p = loadPage('treatments/index.html', 'treatments/')
  assert.deepEqual(p.boot(), [])
  for (const service of SERVICES) {
    const row = p.$<HTMLDetailsElement>(`[data-service="${service.id}"]`)
    assert.ok(row.textContent!.replace(/\s+/g, ' ').includes(priceWithUnit(service)), `${service.id}: ${priceWithUnit(service)}`)
  }
  const first = p.$<HTMLDetailsElement>('[data-service="checkup"]')
  assert.equal(first.open, false)
  p.click(first.querySelector('summary')!)
  assert.equal(first.open, true, 'its row opens')
})
