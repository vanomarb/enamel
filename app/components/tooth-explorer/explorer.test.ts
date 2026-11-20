import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { closeAll, loadPage, type Page } from '../../../tests/harness.ts'
import { NUMBERING_LABEL, NUMBERING_SHORT, NUMBERING_SYSTEMS } from '../../lib/notation.ts'
import { toothName, treatmentsFor } from '../../lib/teeth.ts'
import { initToothExplorer, NUMBERING_KEY, type Change, type ExplorerHost } from './tooth-explorer.ts'
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

/* The numbering switch: FDI, Universal and Palmer. The partial is the same on Home, so these use Treatments. */

const NOTES = {
  fdi: 'Two digits: the quarter of the mouth, then the tooth from the middle.',
  universal: '1 to 32, starting at the upper right back tooth.',
  palmer: 'The quarter of the mouth, then 1 to 8 from the middle.',
}

const tooth = (p: Page, fdi: number) => p.$<SVGGElement>(`.tooth[data-fdi="${fdi}"]`)
const option = (p: Page, system: string) => p.$<HTMLButtonElement>(`[data-numbering] button[data-system="${system}"]`)
const pressed = (p: Page) => p.$$('[data-numbering] button').filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.system)
const listBadge = (p: Page, fdi: number) => p.$(`[data-tooth-list] button[data-fdi="${fdi}"]`).lastElementChild!.textContent

/** The number drawn beside a tooth: each arch draws its numbers in the order of its teeth. */
function chartNumberOf(p: Page, fdi: number): string | null {
  const svg = tooth(p, fdi).closest('svg')!
  const i = [...svg.querySelectorAll('.tooth')].indexOf(tooth(p, fdi))
  return svg.querySelectorAll('.tooth-number')[i].textContent
}

/** Stand-in for a browser that refuses to keep site data. */
function blockStorage(p: Page): void {
  Object.defineProperty(p.window, 'localStorage', {
    get: () => {
      throw new p.window.DOMException('blocked', 'SecurityError')
    },
    configurable: true,
  })
}

test('the numbering switch is a labelled group of three buttons, on FDI to begin with, and hidden without JavaScript', () => {
  const p = loadPage('treatments/index.html', 'treatments/')
  assert.deepEqual(p.boot(), [])
  const group = p.$('[data-numbering]')
  assert.equal(group.getAttribute('role'), 'group')
  assert.equal(group.getAttribute('aria-label'), 'Tooth numbering')
  assert.ok(group.closest('[data-js-only]'), 'hidden without JavaScript, like Upper and Lower')
  assert.ok(group.closest('[data-tooth-explorer] > div')?.contains(p.$('[data-chart]')), 'in the chart’s column')
  const buttons = p.$$<HTMLButtonElement>('[data-numbering] button')
  assert.deepEqual(buttons.map((b) => b.dataset.system), [...NUMBERING_SYSTEMS])
  assert.deepEqual(buttons.map((b) => b.textContent), NUMBERING_SYSTEMS.map((s) => NUMBERING_SHORT[s]), 'FDI, UNI, PAL on screen')
  assert.deepEqual(buttons.map((b) => b.getAttribute('aria-label')), NUMBERING_SYSTEMS.map((s) => NUMBERING_LABEL[s]), 'the full names for screen readers')
  assert.deepEqual(pressed(p), ['fdi'])
  assert.equal(p.text('[data-numbering-note]'), NOTES.fdi)
  assert.equal(group.getAttribute('aria-describedby'), p.$('[data-numbering-note]').id, 'the line under it describes it')
  assert.equal(chartNumberOf(p, 24), '24')
  assert.equal(p.storage(NUMBERING_KEY), null, 'nothing is kept until the visitor changes it')
})

test('switching the numbering relabels the chart, the teeth’s names, the panel, the list and the status in place', () => {
  const p = loadPage('treatments/index.html', 'treatments/')
  assert.deepEqual(p.boot(), [])
  p.click(tooth(p, 24))
  const name = p.$('[data-panel] [data-tooth-name]')
  assert.equal(p.text('[data-panel] [data-tooth-number]'), '24')
  assert.equal(p.text('[data-panel] [data-tooth-line]'), 'Tooth 24, a premolar')
  assert.equal(listBadge(p, 24), '24')

  p.click(option(p, 'universal'))
  assert.deepEqual(pressed(p), ['universal'])
  assert.equal(chartNumberOf(p, 24), '12')
  assert.deepEqual(p.$$('.tooth-number').map((t) => Number(t.textContent)).sort((a, b) => a - b), Array.from({ length: 32 }, (_, i) => i + 1), 'the chart shows 1 to 32')
  assert.equal(tooth(p, 24).getAttribute('aria-label'), 'Upper left first premolar, tooth number 12')
  assert.equal(p.text('[data-panel] [data-tooth-number]'), '#12')
  assert.equal(p.text('[data-panel] [data-tooth-line]'), 'Tooth #12, a premolar')
  assert.equal(listBadge(p, 24), '#12')
  assert.equal(p.text('[data-explorer-status]'), 'Universal numbering. Upper left first premolar, tooth number 12.')
  assert.equal(p.text('[data-numbering-note]'), NOTES.universal)
  assert.equal(p.$('[data-panel] [data-tooth-name]'), name, 'the panel is relabelled, not drawn again')
  assert.equal(p.text('[data-panel] [data-tooth-name]'), toothName(24))
  assert.equal(tooth(p, 24).getAttribute('aria-pressed'), 'true', 'the chosen tooth stays chosen')

  p.click(option(p, 'palmer'))
  assert.deepEqual(pressed(p), ['palmer'])
  assert.equal(chartNumberOf(p, 24), '4', 'the chart shows Palmer’s digit alone')
  assert.equal(chartNumberOf(p, 46), '6')
  assert.equal(tooth(p, 24).getAttribute('aria-label'), 'Upper left first premolar, upper left 4')
  assert.equal(tooth(p, 46).getAttribute('aria-label'), 'Lower right first molar, lower right 6')
  assert.equal(p.text('[data-panel] [data-tooth-number]'), 'UL4')
  assert.equal(p.text('[data-panel] [data-tooth-line]'), 'Tooth UL4, a premolar')
  assert.equal(listBadge(p, 24), 'UL4')
  assert.equal(p.text('[data-explorer-status]'), 'Palmer numbering. Upper left first premolar, upper left 4.')
  assert.equal(p.text('[data-numbering-note]'), NOTES.palmer)

  // A tooth chosen afterwards opens in the numbering on show.
  p.click(tooth(p, 16))
  assert.equal(p.text('[data-panel] [data-tooth-number]'), 'UR6')
  assert.equal(p.text('[data-panel] [data-tooth-line]'), 'Tooth UR6, a molar')
  assert.match(p.text('[data-explorer-status]'), new RegExp(`^${toothName(16)}\\. ${treatmentsFor(16).length} usual treatments\\.$`))

  p.click(option(p, 'fdi'))
  assert.deepEqual(pressed(p), ['fdi'])
  assert.equal(chartNumberOf(p, 16), '16')
  assert.equal(tooth(p, 16).getAttribute('aria-label'), 'Upper right first molar, tooth 16')
  assert.equal(p.text('[data-panel] [data-tooth-line]'), 'Tooth 16, a molar')
  assert.equal(listBadge(p, 16), '16')
  assert.equal(p.text('[data-explorer-status]'), 'FDI numbering. Upper right first molar, tooth 16.')
})

test('with no tooth chosen, switching says only which numbering is on', () => {
  const p = loadPage('treatments/index.html', 'treatments/')
  assert.deepEqual(p.boot(), [])
  p.click(option(p, 'universal'))
  assert.equal(p.text('[data-explorer-status]'), 'Universal numbering.')
  assert.equal(p.text('[data-panel] [data-empty] h3'), 'No tooth chosen yet', 'the panel stays empty')
  const status = p.text('[data-explorer-status]')
  p.click(option(p, 'universal'))
  assert.equal(p.text('[data-explorer-status]'), status, 'choosing the numbering already on changes nothing')
})

test('the numbering is kept in enamel.numbering and comes back on the next visit', () => {
  const first = loadPage('treatments/index.html', 'treatments/')
  assert.deepEqual(first.boot(), [])
  first.click(option(first, 'palmer'))
  assert.equal(first.storage(NUMBERING_KEY), 'palmer')

  const again = loadPage('treatments/index.html', 'treatments/', { storage: { [NUMBERING_KEY]: first.window.localStorage.getItem(NUMBERING_KEY) } })
  assert.deepEqual(again.boot(), [])
  assert.deepEqual(pressed(again), ['palmer'])
  assert.equal(chartNumberOf(again, 24), '4')
  assert.equal(tooth(again, 24).getAttribute('aria-label'), 'Upper left first premolar, upper left 4')
  assert.equal(listBadge(again, 24), 'UL4')
  assert.equal(again.text('[data-numbering-note]'), NOTES.palmer)
  assert.equal(again.text('[data-explorer-status]'), '', 'nothing is announced on load')
  again.click(tooth(again, 24))
  assert.equal(again.text('[data-panel] [data-tooth-line]'), 'Tooth UL4, a premolar')

  // Home shares the choice.
  const home = loadPage('index.html', '', { storage: { [NUMBERING_KEY]: first.window.localStorage.getItem(NUMBERING_KEY) } })
  assert.deepEqual(home.boot(), [])
  assert.deepEqual(pressed(home), ['palmer'])

  for (const kept of ['"braille"', 'not json', '"FDI"']) {
    const odd = loadPage('treatments/index.html', 'treatments/', { storage: { [NUMBERING_KEY]: kept } })
    assert.deepEqual(odd.boot(), [], `${kept}: starts without errors`)
    assert.deepEqual(pressed(odd), ['fdi'], `${kept}: falls back to FDI`)
    assert.equal(chartNumberOf(odd, 24), '24')
  }
})

test('with storage blocked, the explorer starts on FDI and the switch still works for the visit', () => {
  const p = loadPage('treatments/index.html', 'treatments/')
  blockStorage(p)
  assert.deepEqual(p.boot(), [])
  assert.deepEqual(pressed(p), ['fdi'])
  assert.equal(chartNumberOf(p, 24), '24')
  p.click(option(p, 'universal'))
  assert.deepEqual(pressed(p), ['universal'])
  assert.equal(chartNumberOf(p, 24), '12')
  assert.equal(tooth(p, 24).getAttribute('aria-label'), 'Upper left first premolar, tooth number 12')
})

test('the switch’s buttons are in the tab order, and aria-pressed follows the choice', () => {
  const p = loadPage('treatments/index.html', 'treatments/')
  assert.deepEqual(p.boot(), [])
  for (const system of NUMBERING_SYSTEMS) {
    const button = option(p, system)
    assert.equal(button.tagName, 'BUTTON')
    assert.equal(button.type, 'button')
    assert.equal(button.disabled, false)
    assert.equal(button.tabIndex, 0, `${system}: reachable with Tab`)
    button.focus()
    assert.equal(p.document.activeElement, button, `${system}: takes focus`)
    // A browser turns Enter and Space on a focused button into a click; jsdom doesn't, so the click stands in.
    p.click(button)
    assert.deepEqual(pressed(p), [system])
    assert.deepEqual(
      p.$$('[data-numbering] button').map((b) => b.getAttribute('aria-pressed')),
      NUMBERING_SYSTEMS.map((s) => String(s === system)),
    )
    assert.equal(p.document.activeElement, button, `${system}: focus stays on the button`)
  }
  const order = p.$$<HTMLElement>('button, [tabindex="0"]').filter((el) => el.closest('[data-tooth-explorer]'))
  const at = (el: Element) => order.indexOf(el as HTMLElement)
  assert.ok(at(option(p, 'palmer')) < at(p.$('.tooth[tabindex="0"]')), 'the switch comes before the chart in the tab order')
})

test('the 3D view can read the numbering, and hears each change of it', async () => {
  const p = loadPage('treatments/index.html', 'treatments/')
  // As if the page were scrolled to the explorer, so the view is offered the host.
  p.window.IntersectionObserver = class {
    callback: IntersectionObserverCallback
    constructor(callback: IntersectionObserverCallback) {
      this.callback = callback
    }
    observe(target: Element) {
      this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
    }
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  } as unknown as typeof IntersectionObserver
  let host: ExplorerHost | null = null
  const heard: Change[] = []
  p.run(() =>
    initToothExplorer(p.$('[data-tooth-explorer]'), async (h) => {
      host = h
      h.onChange((change) => heard.push(change))
      return null
    }),
  )
  await p.wait(20)
  assert.ok(host)
  const view = host as ExplorerHost
  assert.equal(view.numbering(), 'fdi')
  p.click(option(p, 'universal'))
  assert.equal(view.numbering(), 'universal')
  assert.deepEqual(heard, ['numbering'])
  p.click(option(p, 'universal'))
  assert.deepEqual(heard, ['numbering'], 'no news when nothing changed')
  p.click(option(p, 'palmer'))
  assert.equal(view.numbering(), 'palmer')
  assert.deepEqual(heard, ['numbering', 'numbering'])
})

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
