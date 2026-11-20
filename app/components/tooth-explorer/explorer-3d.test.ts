import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { closeAll, loadPage, type Page } from '../../../tests/harness.ts'
import { toothName } from '../../lib/teeth.ts'
import { initToothExplorer, type ExplorerHost, type ModelLoader } from './tooth-explorer.ts'
import { mountOverlay } from './tooth-overlay.ts'

/* jsdom has no WebGL, so these check the 3D model's loading and its contract with the explorer, not its drawing. */

after(closeAll)

/** An IntersectionObserver that reports its element in view straight away, as if the page were scrolled to it. */
function scrolledTo(p: Page): void {
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
}

const explorerOn = (p: Page) => p.$('[data-tooth-explorer]')
const tooth = (p: Page, fdi: number) => p.$<SVGGElement>(`.tooth[data-fdi="${fdi}"]`)

test('without WebGL the flat chart stays as it is, even once the page is scrolled to it', async () => {
  const p = loadPage('treatments/index.html', 'treatments/')
  scrolledTo(p)
  assert.deepEqual(p.boot(), [], 'starts without errors')
  await p.wait(20)
  const root = explorerOn(p)
  assert.equal(root.dataset.view, undefined, 'no 3D view')
  assert.equal(p.$$('[data-model], canvas').length, 0, 'no canvas')
  assert.equal(p.$$('[data-chart] svg').length, 2, 'both arches are still drawn')
  p.click(tooth(p, 36))
  assert.equal(p.text('[data-panel] [data-tooth-name]'), toothName(36), 'and the chart still works')
  assert.equal(root.dataset.arch, 'lower')
})

test('nothing is loaded until the explorer nears the viewport', async () => {
  const p = loadPage('index.html', '')
  let loads = 0
  p.run(() => initToothExplorer(explorerOn(p), async () => (loads++, null)))
  await p.wait(20)
  assert.equal(loads, 0)
})

test('a 3D view that starts takes over the screen, shows the explorer’s changes and picks through the same path', async () => {
  const p = loadPage('treatments/index.html', 'treatments/')
  scrolledTo(p)
  let host: ExplorerHost | null = null
  let changes = 0
  let disposed = 0
  const load: ModelLoader = async (h) => {
    host = h
    h.onChange(() => changes++)
    return { dispose: () => void disposed++ }
  }
  p.run(() => initToothExplorer(explorerOn(p), load))
  await p.wait(20)
  const root = explorerOn(p)
  assert.equal(root.dataset.view, '3d', 'the explorer says the 3D view is on (the CSS hides the flat arches from sight then)')
  assert.ok(host, 'the view got the explorer')
  const view = host as ExplorerHost

  // A tap on the model goes through select(): the panel, the pressed states, the list and the announcement all follow.
  view.select(16)
  assert.equal(view.selected(), 16)
  assert.equal(p.text('[data-panel] [data-tooth-name]'), toothName(16))
  assert.equal(tooth(p, 16).getAttribute('aria-pressed'), 'true')
  assert.equal(p.$('[data-tooth-list] button[data-fdi="16"]').getAttribute('aria-pressed'), 'true')
  assert.match(p.text('[data-explorer-status]'), new RegExp(`^${toothName(16)}\\.`))
  assert.ok(changes > 0, 'the view heard about it')

  // A tooth on the other arch turns the view, and the Upper and Lower buttons turn it back.
  view.select(46)
  assert.equal(view.arch(), 'lower')
  assert.equal(p.$('[data-arch-toggle] [data-arch="lower"]').getAttribute('aria-pressed'), 'true')
  p.click('[data-arch-toggle] [data-arch="upper"]')
  assert.equal(view.arch(), 'upper')

  // The flat chart's teeth are still the keyboard's: the arrows move along them and the view hears each move.
  const before = changes
  tooth(p, 11).focus()
  p.key('ArrowRight')
  assert.equal(p.document.activeElement, tooth(p, 21))
  assert.ok(changes > before)

  root.remove()
  await p.wait(0)
  assert.equal(disposed, 1, 'the view is let go when the explorer leaves the page')
})

test('if the 3D view can’t start, or loses its drawing context later, the flat chart comes back', async () => {
  const warned: unknown[] = []
  const original = console.warn
  console.warn = (...args: unknown[]) => void warned.push(args)
  try {
    const failing = loadPage('index.html', '')
    scrolledTo(failing)
    failing.run(() => initToothExplorer(explorerOn(failing), async () => Promise.reject(new Error('no context'))))
    await failing.wait(20)
    assert.equal(explorerOn(failing).dataset.view, undefined)
    assert.equal(warned.length, 1, 'it says why in the console')
  } finally {
    console.warn = original
  }

  const losing = loadPage('index.html', '')
  scrolledTo(losing)
  let lose = () => {}
  let disposed = 0
  losing.run(() =>
    initToothExplorer(explorerOn(losing), async (_host, lost) => {
      lose = lost
      return { dispose: () => void disposed++ }
    }),
  )
  await losing.wait(20)
  assert.equal(explorerOn(losing).dataset.view, '3d')
  lose()
  assert.equal(explorerOn(losing).dataset.view, undefined, 'back to the flat chart')
  assert.equal(disposed, 1)
})

/** A stand-in 3D view: the real overlay over a canvas that isn't drawn, pinning chips in a row and logging its moves. */
function fakeView(calls: string[]): ModelLoader {
  return async (host) => {
    const overlay = mountOverlay(host, host.chart, {
      chip: (fdi) => ({ x: 20 + ((fdi % 10) + ([1, 4].includes(Math.floor(fdi / 10)) ? 8 : 0)) * 45, y: Math.floor(fdi / 10) <= 2 ? 40 : 120, depth: fdi % 10 }),
      landmarks: () => [
        { name: 'Mesiobuccal cusp', x: 40, y: 40, depth: 1, visible: true },
        { name: 'Apex', x: 40, y: 200, depth: 2, visible: true },
      ],
      focus: (fdi, back) => void calls.push(`focus ${fdi} ${back}`),
      inside: (mode) => void calls.push(`inside ${mode}`),
      showLandmarks: (on) => void calls.push(`landmarks ${on}`),
      zoom: (factor) => void calls.push(`zoom ${factor.toFixed(2)}`),
      highlight: () => {},
    })
    overlay.place()
    return { dispose: () => overlay.dispose() }
  }
}

const chipText = (p: Page) => p.$$('[data-chips] span').filter((s) => !s.hidden).map((s) => s.textContent)

test('the model’s number chips follow the numbering the visitor picks, live', async () => {
  const p = loadPage('treatments/index.html', 'treatments/')
  scrolledTo(p)
  p.run(() => initToothExplorer(explorerOn(p), fakeView([])))
  await p.wait(20)
  assert.equal(p.$$('[data-chips] span').length, 32, 'one chip per tooth')
  assert.ok(chipText(p).includes('11') && chipText(p).includes('48'), 'FDI to begin with')
  p.click('[data-numbering] [data-system="universal"]')
  assert.ok(chipText(p).includes('#8') && chipText(p).includes('#32') && !chipText(p).includes('11'), 'Universal')
  p.click('[data-numbering] [data-system="palmer"]')
  assert.ok(chipText(p).includes('UR1') && chipText(p).includes('LR8'), 'Palmer')
  assert.equal(p.$('[data-chips]').getAttribute('aria-hidden'), 'true', 'the chips are decoration; the chart’s teeth carry the names')
})

test('choosing a tooth opens the close-up; its tools work; Escape, an empty tap and Reset view leave it', async () => {
  const p = loadPage('treatments/index.html', 'treatments/')
  scrolledTo(p)
  const calls: string[] = []
  let host: ExplorerHost | null = null
  const load = fakeView(calls)
  p.run(() => initToothExplorer(explorerOn(p), async (h, lost) => ((host = h), load(h, lost))))
  await p.wait(20)
  const inside = p.$('[data-inside]')
  assert.ok(inside.hidden && p.$<HTMLButtonElement>('[data-landmark-toggle]').hidden, 'no anatomy tools before a tooth is open')

  // Enter on a tooth in the chart chooses it, which opens the close-up and shows only its chip, in apricot.
  tooth(p, 36).focus()
  p.key('Enter')
  assert.deepEqual(calls.splice(0), ['focus 36 previous'])
  assert.equal(p.text('[data-panel] [data-tooth-name]'), toothName(36))
  assert.ok(!inside.hidden)
  const shown = p.$$('[data-chips] span').filter((s) => !s.hidden)
  assert.equal(shown.length, 1)
  assert.equal(shown[0].dataset.state, 'chosen')

  // Inside: three labelled steps with aria-pressed; Landmarks: a toggle that adds a button per landmark.
  const steps = p.$$<HTMLButtonElement>('[data-inside] button')
  assert.deepEqual(steps.map((b) => b.textContent), ['Surface', 'Dentin', 'Pulp and canals'])
  p.click(steps[1])
  assert.deepEqual(steps.map((b) => b.getAttribute('aria-pressed')), ['false', 'true', 'false'])
  p.click('[data-landmark-toggle]')
  assert.equal(p.$('[data-landmark-toggle]').getAttribute('aria-pressed'), 'true')
  assert.deepEqual(p.$$('[data-landmarks] button').map((b) => b.getAttribute('aria-label')), ['Mesiobuccal cusp', 'Apex'])
  assert.deepEqual(calls.splice(0), ['inside dentin', 'landmarks true'])

  // Escape closes it; the tooth stays chosen and the tools reset.
  p.$<HTMLButtonElement>('[data-landmarks] button').focus()
  p.key('Escape')
  assert.deepEqual(calls.splice(0), ['focus null previous'])
  assert.ok(inside.hidden && p.$$('[data-landmarks] button').length === 0)
  assert.equal(steps[0].getAttribute('aria-pressed'), 'true')
  assert.equal(p.text('[data-panel] [data-tooth-name]'), toothName(36), 'still chosen')
  assert.equal(p.document.activeElement, tooth(p, 36), 'focus goes back to the chart’s tooth')

  // Choosing another tooth opens it straight away; Reset view leaves the close-up and returns to the rest view.
  ;(host as unknown as ExplorerHost).select(46)
  assert.deepEqual(calls.splice(0), ['focus 46 previous'])
  p.click('[data-reset]')
  assert.deepEqual(calls.splice(0), ['focus null rest'])
  p.click('[data-zoom="in"]')
  p.click('[data-zoom="out"]')
  assert.deepEqual(calls.splice(0), ['zoom 0.71', 'zoom 1.40'])

  // Escape outside the close-up is left alone.
  p.key('Escape', p.document.body)
  assert.deepEqual(calls, [])
  explorerOn(p).remove()
  await p.wait(0)
  assert.equal(p.$$('[data-model-overlay]').length, 0, 'the overlay goes with the view')
})

test('the panel adds plain notes about the tooth, in the flat chart and with the 3D view', async () => {
  for (const withModel of [false, true]) {
    const p = loadPage('treatments/index.html', 'treatments/')
    scrolledTo(p)
    if (withModel) p.run(() => initToothExplorer(explorerOn(p), fakeView([])))
    else assert.deepEqual(p.boot(), [])
    await p.wait(20)
    assert.equal(explorerOn(p).dataset.view, withModel ? '3d' : undefined)
    p.click(tooth(p, 16))
    const about = p.$('[data-panel] [data-tooth-about]')
    assert.match(about.textContent ?? '', /About this tooth/)
    assert.match(p.text('[data-tooth-about] p'), /grinder/)
    const facts = p.$$('[data-tooth-about] dt').map((dt) => [dt.textContent, dt.nextElementSibling?.textContent])
    assert.deepEqual(facts.map(([label]) => label), ['Roots', 'Canals', 'Cusps', 'Comes in'])
    assert.match(String(facts[0][1]), /^Three/)
    // It comes after the treatments, which stay as they were.
    const panel = p.$('[data-panel]')
    assert.ok(panel.querySelector('ul')!.compareDocumentPosition(about) & 4, 'below the treatments')
    assert.ok(panel.querySelectorAll('a').length >= 6, 'the Book this links are still there')
  }
})
