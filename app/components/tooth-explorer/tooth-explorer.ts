import { bookingHref } from '../../lib/book-link.ts'
import { BASE } from '../../lib/base.ts'
import { durationLabel, priceParts, serviceById, type Service } from '../../lib/services.ts'
import { chartNumber, formatTooth, isNumberingSystem, NUMBERING_LABEL, spokenTooth, type NumberingSystem } from '../../lib/notation.ts'
import { toothByFdi, toothName, treatmentsFor, type ToothType } from '../../lib/teeth.ts'
import { NOTE_FACTS, toothNotes } from '../../lib/tooth-anatomy.ts'
import { browserStore } from '../../shared/storage.ts'
import { ROWS, layArch, type Arch, type Placed } from './arch.ts'

const TYPE_LABEL: Record<ToothType, string> = {
  incisor: 'an incisor',
  canine: 'a canine',
  premolar: 'a premolar',
  molar: 'a molar',
  wisdom: 'a wisdom tooth',
}

/** Where the visitor's numbering is kept. It starts with STORAGE_PREFIX (lib/account.ts), so “Remove everything saved here” clears it too. */
export const NUMBERING_KEY = 'enamel.numbering'

/** The line under the numbering switch. */
const NUMBERING_NOTE: Record<NumberingSystem, string> = {
  fdi: 'Two digits: the quarter of the mouth, then the tooth from the middle.',
  universal: '1 to 32, starting at the upper right back tooth.',
  palmer: 'The quarter of the mouth, then 1 to 8 from the middle.',
}

/** The saved numbering, or FDI when there is none or storage is blocked. */
function storedNumbering(): NumberingSystem {
  try {
    const value: unknown = JSON.parse(browserStore()?.getItem(NUMBERING_KEY) ?? 'null')
    return isNumberingSystem(value) ? value : 'fdi'
  } catch {
    return 'fdi'
  }
}

function storeNumbering(system: NumberingSystem): void {
  try {
    browserStore()?.setItem(NUMBERING_KEY, JSON.stringify(system))
  } catch {
    // Storage is blocked or full: the choice lasts until the page is left.
  }
}

/** A tooth as a screen reader hears it: "Upper left first premolar, tooth 24", or "…, tooth number 12" in Universal. */
const toothLabel = (fdi: number, system: NumberingSystem) => `${toothName(fdi)}, ${spokenTooth(fdi, system)}`

const LIST_GROUPS: { title: string; text: string; types: ToothType[] }[] = [
  { title: 'Front teeth', text: 'Incisors and canines, the twelve teeth at the front of your mouth.', types: ['incisor', 'canine'] },
  { title: 'Premolars', text: 'Eight teeth, two behind each canine.', types: ['premolar'] },
  { title: 'Molars', text: 'Eight broad back teeth for chewing, two behind each pair of premolars.', types: ['molar'] },
  { title: 'Wisdom teeth', text: 'The last molar at each end, if yours have come in.', types: ['wisdom'] },
]

/* The grooves drawn on the back teeth, in chart units (arch.ts has the sizes and positions). */
const INNER: Record<number, [number, number, number]> = { 4: [12, 14, 4.6], 5: [12, 14, 4.6], 6: [18, 20, 6], 7: [17, 19.5, 5.8], 8: [15.5, 18.5, 5.2] }

const round = (n: number) => Math.round(n * 10) / 10

/* With the 3D model on (data-view="3d"), the arches stay in the page for the keyboard and screen readers, out of sight. */
const ARCH_CLASS: Record<Arch, string> = {
  upper: 'h-auto w-full overflow-visible max-sm:group-data-[arch=lower]/explorer:hidden group-data-[view=3d]/explorer:sr-only',
  lower: 'h-auto w-full overflow-visible max-sm:group-data-[arch=upper]/explorer:hidden group-data-[view=3d]/explorer:sr-only',
}

function roundedRectPath(w: number, h: number, r: number): string {
  const x = -w / 2
  const y = -h / 2
  return `M${round(x + r)} ${round(y)}H${round(x + w - r)}A${r} ${r} 0 0 1 ${round(x + w)} ${round(y + r)}V${round(y + h - r)}A${r} ${r} 0 0 1 ${round(x + w - r)} ${round(y + h)}H${round(x + r)}A${r} ${r} 0 0 1 ${round(x)} ${round(y + h - r)}V${round(y + r)}A${r} ${r} 0 0 1 ${round(x + r)} ${round(y)}Z`
}

function toothMarkup(t: Placed): string {
  const p = t.fdi % 10
  const radius = round(p <= 2 ? t.w * 0.46 : p === 3 ? t.w * 0.44 : p <= 5 ? Math.min(t.w, t.d) * 0.4 : Math.min(t.w, t.d) * 0.32)
  const inner = INNER[p] ? `<path class="groove" d="${roundedRectPath(...INNER[p])}"/>` : ''
  return (
    `<g class="tooth" data-fdi="${t.fdi}" aria-label="${toothLabel(t.fdi, 'fdi')}" transform="translate(${round(t.x)} ${round(t.y)}) rotate(${round(t.angle)})">` +
    `<rect class="tooth-ring" x="${-t.w / 2 - 4.5}" y="${-t.d / 2 - 4.5}" width="${t.w + 9}" height="${t.d + 9}" rx="${round(radius + 4.5)}"/>` +
    `<rect x="${-t.w / 2}" y="${-t.d / 2}" width="${t.w}" height="${t.d}" rx="${radius}"/>${inner}</g>`
  )
}

/** One arch as static SVG; tooth-explorer.html carries this exact markup (tests/static-shells.test.ts checks). */
export function archMarkup(arch: Arch): string {
  const teeth = layArch(arch)
  const numbers = teeth
    .map((t) => `<text class="tooth-number" x="${round(t.x + t.nx * (t.d / 2 + 12))}" y="${round(t.y + t.ny * (t.d / 2 + 12))}">${t.fdi}</text>`)
    .join('')
  const viewBox = arch === 'upper' ? '-149 -21 298 230' : '-149 -209 298 230'
  const name = arch === 'upper' ? 'Upper teeth' : 'Lower teeth'
  return `<svg class="${ARCH_CLASS[arch]}" viewBox="${viewBox}" width="298" height="230" role="group" aria-label="${name}"><g aria-hidden="true">${numbers}</g>${teeth.map(toothMarkup).join('')}</svg>`
}

/** The tooth list shown below 600 px, also static in tooth-explorer.html. */
export function toothListMarkup(): string {
  return `<div class="grid gap-6 pb-6">${LIST_GROUPS.map(
    (group) =>
      `<section><h4 class="text-lg font-normal">${group.title}</h4><p class="text-sm text-sage">${group.text}</p><div class="mt-3 grid grid-cols-[repeat(auto-fill,minmax(9.25rem,1fr))] gap-2">${[...ROWS.upper, ...ROWS.lower]
        .filter((fdi) => group.types.includes(toothByFdi(fdi).type))
        .map(
          (fdi) =>
            `<button type="button" class="option flex min-h-12 items-center justify-between gap-2 px-3 py-2 text-left text-sm leading-[1.3]" data-fdi="${fdi}" aria-pressed="false"><span>${toothName(fdi)}</span><span class="font-display text-base text-sage">${fdi}</span></button>`,
        )
        .join('')}</div></section>`,
  ).join('')}</div>`
}

/** "Tooth 24, a premolar", "Tooth #12, a premolar" or "Tooth UL4, a premolar". */
const toothLine = (fdi: number, system: NumberingSystem) => `Tooth ${formatTooth(fdi, system)}, ${TYPE_LABEL[toothByFdi(fdi).type]}`

function treatmentRow(service: Service): string {
  const { amount, unit: unitText } = priceParts(service)
  const unit = unitText ? ` <span class="font-text text-sm text-sage">${unitText}</span>` : ''
  return (
    `<li class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 border-b border-line py-3">` +
    `<div class="flex flex-wrap items-baseline gap-x-3"><span class="font-semibold">${service.name}</span>` +
    `<span class="text-sm text-sage">${durationLabel(service)}</span></div>` +
    `<span class="col-start-1 font-display text-lg tabular-nums"><span class="font-text text-sm text-sage">starts at</span> ${amount}${unit}</span>` +
    `<a class="button button--quiet button--small col-start-2 row-span-2 row-start-1" href="${bookingHref(BASE, service.id)}">Book this<span class="sr-only">: ${service.name}</span></a></li>`
  )
}

function detailMarkup(fdi: number, system: NumberingSystem): string {
  const services = treatmentsFor(fdi)
    .map(serviceById)
    .filter((s): s is Service => s !== undefined)
  return `
    <div class="grid gap-1 motion-safe:animate-panel-in">
      <p class="flex items-center gap-3 font-display text-[3.25rem] leading-none font-light after:size-2.5 after:rounded-full after:bg-apricot" aria-hidden="true" data-tooth-number>${formatTooth(fdi, system)}</p>
      <h3 class="mt-2 text-2xl font-light" tabindex="-1" data-tooth-name>${toothName(fdi)}</h3>
      <p class="text-sage" data-tooth-line>${toothLine(fdi, system)}</p>
      <h4 class="mt-6 border-b border-line-strong pb-2 font-text text-sm font-semibold">Usual treatments</h4>
      <ul>${services.map(treatmentRow).join('')}</ul>
      <p class="mt-4 text-sm text-sage">Not sure which tooth it is? Book a check-up and the dentist will find it with you.</p>
      ${aboutMarkup(fdi)}
    </div>`
}

/** Plain notes on the tooth's anatomy, under its treatments. */
function aboutMarkup(fdi: number): string {
  const notes = toothNotes(fdi)
  return (
    `<section class="mt-8 grid gap-3" data-tooth-about><h4 class="border-b border-line-strong pb-2 font-text text-sm font-semibold">About this tooth</h4>` +
    `<p>${notes.summary}</p>` +
    `<dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-2 text-sm">${NOTE_FACTS.map(([key, label]) => `<dt class="font-semibold">${label}</dt><dd class="text-sage">${notes[key]}</dd>`).join('')}</dl></section>`
  )
}

/** What changed: the arch on show, the chosen tooth (chosen again counts too), the keyboard's tab stop, or the numbering. */
export type Change = 'arch' | 'select' | 'stop' | 'numbering'

/** What the 3D model needs from the explorer: it shows the explorer's state and hands picks back through select(). */
export interface ExplorerHost {
  root: HTMLElement
  chart: HTMLElement
  arch(): Arch
  selected(): number | null
  /** The numbering the visitor chose: label teeth with formatTooth(fdi, host.numbering()) from lib/notation.ts. */
  numbering(): NumberingSystem
  select(fdi: number): void
  /** Calls back after each change of arch, chosen tooth, tab stop or numbering, saying which. Returns a function that stops it. */
  onChange(listener: (change: Change) => void): () => void
}

export interface ModelView {
  dispose(): void
}

/** Resolves to the mounted 3D view, or null when this browser can't draw it. */
export type ModelLoader = (host: ExplorerHost, lost: () => void) => Promise<ModelView | null>

/** A throwaway context answers whether WebGL works here before three.js is downloaded. */
function webglWorks(): boolean {
  if (typeof WebGLRenderingContext === 'undefined') return false
  try {
    const gl = document.createElement('canvas').getContext('webgl2') ?? document.createElement('canvas').getContext('webgl')
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
    return gl !== null
  } catch {
    return false
  }
}

const loadModel: ModelLoader = async (host, lost) => {
  if (!webglWorks()) return null
  const { mountToothView } = await import('./tooth-view.ts')
  return mountToothView(host, lost)
}

/** Runs once the element is within half a screen of the viewport, so a page read without scrolling there never loads it. */
function whenNear(el: Element, run: () => void): void {
  if (typeof IntersectionObserver === 'undefined') return run()
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      observer.disconnect()
      run()
    },
    { rootMargin: '50% 0px' },
  )
  observer.observe(el)
}

/** The flat chart is the page's own; the 3D model replaces it on screen only once it has drawn, and the flat one stays for keyboards and screen readers. */
function offerModel(host: ExplorerHost, load: ModelLoader, beforeLoad: () => void): void {
  const { root } = host
  whenNear(root, () => {
    beforeLoad()
    let view: ModelView | null = null
    const watcher = new MutationObserver(() => {
      if (!root.isConnected) flat()
    })
    function flat() {
      watcher.disconnect()
      view?.dispose()
      view = null
      delete root.dataset.view
    }
    load(host, flat)
      .then((mounted) => {
        if (!mounted) return
        view = mounted
        root.dataset.view = '3d'
        watcher.observe(document.documentElement, { childList: true, subtree: true })
      })
      .catch((error: unknown) => {
        flat()
        console.warn('Enamel: the 3D tooth model could not start, so the flat chart stays.', error)
      })
  })
}

export function initToothExplorer(root: HTMLElement, load: ModelLoader = loadModel): void {
  const chart = root.querySelector<HTMLElement>('[data-chart]')
  const panel = root.querySelector<HTMLElement>('[data-panel]')
  const status = root.querySelector<HTMLElement>('[data-explorer-status]')
  if (!chart || !panel || !status) return
  let selected: number | null = null
  let numbering = storedNumbering()
  const listeners = new Set<(change: Change) => void>()
  const changed = (change: Change) => {
    for (const listener of listeners) listener(change)
  }

  const teeth = [...chart.querySelectorAll<SVGGElement>('.tooth')]
  for (const tooth of teeth) {
    tooth.setAttribute('role', 'button')
    tooth.setAttribute('aria-pressed', 'false')
    tooth.setAttribute('tabindex', '-1')
  }

  /* Each arch draws its numbers in the same order as its teeth, so the nth number belongs to the nth tooth. */
  const chartNumbers = [...chart.querySelectorAll('svg')].flatMap((svg) => {
    const owners = [...svg.querySelectorAll<SVGGElement>('.tooth')]
    return [...svg.querySelectorAll('.tooth-number')].map((text, i) => ({ text, fdi: Number(owners[i].dataset.fdi) }))
  })
  const listNumbers = [...root.querySelectorAll<HTMLButtonElement>('[data-tooth-list] button[data-fdi]')].map((button) => ({ badge: button.lastElementChild, fdi: Number(button.dataset.fdi) }))
  const note = root.querySelector('[data-numbering-note]')

  /* Relabels every number in place: the chart, the teeth's names, the list, the panel and the switch. */
  const showNumbering = () => {
    for (const { text, fdi } of chartNumbers) text.textContent = chartNumber(fdi, numbering)
    for (const tooth of teeth) tooth.setAttribute('aria-label', toothLabel(Number(tooth.dataset.fdi), numbering))
    for (const { badge, fdi } of listNumbers) if (badge) badge.textContent = formatTooth(fdi, numbering)
    if (selected !== null) {
      const number = panel.querySelector('[data-tooth-number]')
      const line = panel.querySelector('[data-tooth-line]')
      if (number) number.textContent = formatTooth(selected, numbering)
      if (line) line.textContent = toothLine(selected, numbering)
    }
    for (const b of root.querySelectorAll<HTMLButtonElement>('[data-numbering] button')) b.setAttribute('aria-pressed', String(b.dataset.system === numbering))
    if (note) note.textContent = NUMBERING_NOTE[numbering]
  }

  const setNumbering = (system: NumberingSystem) => {
    if (system === numbering) return
    numbering = system
    storeNumbering(system)
    showNumbering()
    status.textContent = `${NUMBERING_LABEL[system]} numbering.${selected === null ? '' : ` ${toothLabel(selected, system)}.`}`
    changed('numbering')
  }

  const toothEl = (fdi: number) => chart.querySelector<SVGGElement>(`.tooth[data-fdi="${fdi}"]`)
  const archOf = (fdi: number): Arch => toothByFdi(fdi).arch

  const setTabStop = (fdi: number) => {
    for (const tooth of teeth) tooth.setAttribute('tabindex', tooth.dataset.fdi === String(fdi) ? '0' : '-1')
    changed('stop')
  }

  const setArch = (arch: Arch) => {
    root.dataset.arch = arch
    for (const b of root.querySelectorAll<HTMLButtonElement>('[data-arch-toggle] button')) b.setAttribute('aria-pressed', String(b.dataset.arch === arch))
    const stop = teeth.find((t) => t.getAttribute('tabindex') === '0')
    if (!stop || archOf(Number(stop.dataset.fdi)) !== arch) setTabStop(selected !== null && archOf(selected) === arch ? selected : ROWS[arch][7])
    changed('arch')
  }

  const select = (fdi: number) => {
    selected = fdi
    for (const el of root.querySelectorAll<Element>('[data-fdi]')) {
      const on = el.getAttribute('data-fdi') === String(fdi)
      el.setAttribute('aria-pressed', String(on))
      el.classList.toggle('is-selected', on)
    }
    setTabStop(fdi)
    if (archOf(fdi) !== root.dataset.arch) setArch(archOf(fdi))
    panel.innerHTML = detailMarkup(fdi, numbering)
    status.textContent = `${toothName(fdi)}. ${treatmentsFor(fdi).length} usual treatments.`
    changed('select')
  }

  chart.addEventListener('click', (event) => {
    const tooth = (event.target as Element).closest<SVGGElement>('.tooth')
    if (tooth) select(Number(tooth.dataset.fdi))
  })

  chart.addEventListener('keydown', (event) => {
    const tooth = (event.target as Element).closest<SVGGElement>('.tooth')
    if (!tooth) return
    const fdi = Number(tooth.dataset.fdi)
    const arch = archOf(fdi)
    const row = ROWS[arch]
    const index = row.indexOf(fdi)
    let next: number | null = null
    switch (event.key) {
      case 'ArrowRight':
        next = row[Math.min(index + 1, row.length - 1)]
        break
      case 'ArrowLeft':
        next = row[Math.max(index - 1, 0)]
        break
      case 'Home':
        next = row[0]
        break
      case 'End':
        next = row[row.length - 1]
        break
      case 'ArrowUp':
        next = ROWS.upper[index]
        break
      case 'ArrowDown':
        next = ROWS.lower[index]
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        select(fdi)
        return
      default:
        return
    }
    event.preventDefault()
    if (archOf(next) !== arch) setArch(archOf(next))
    setTabStop(next)
    toothEl(next)?.focus()
  })

  root.querySelector('[data-arch-toggle]')?.addEventListener('click', (event) => {
    const option = (event.target as Element).closest<HTMLButtonElement>('button[data-arch]')
    if (option?.dataset.arch === 'upper' || option?.dataset.arch === 'lower') setArch(option.dataset.arch)
  })

  root.querySelector('[data-numbering]')?.addEventListener('click', (event) => {
    const option = (event.target as Element).closest<HTMLButtonElement>('button[data-system]')
    if (isNumberingSystem(option?.dataset.system)) setNumbering(option.dataset.system)
  })

  root.querySelector('[data-tooth-list]')?.addEventListener('click', (event) => {
    const pick = (event.target as Element).closest<HTMLButtonElement>('button[data-fdi]')
    if (!pick) return
    select(Number(pick.dataset.fdi))
    panel.querySelector<HTMLElement>('[data-tooth-name]')?.focus()
  })

  setTabStop(11)
  showNumbering()

  const host: ExplorerHost = {
    root,
    chart,
    arch: () => (root.dataset.arch === 'lower' ? 'lower' : 'upper'),
    selected: () => selected,
    numbering: () => numbering,
    select,
    onChange(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
  // The 3D model opens on the lower teeth, seen from the front like a smile, unless a tooth is already chosen.
  offerModel(host, load, () => {
    if (selected === null && webglWorks()) setArch('lower')
  })
}
