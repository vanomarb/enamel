import { formatTooth } from '../../lib/notation.ts'
import { ROWS } from './arch.ts'
import type { ExplorerHost } from './tooth-explorer.ts'

/* What sits over the 3D canvas: each tooth's number chip, the close-up's landmark buttons, the zoom and reset buttons,
   and the anatomy tools. It also keeps the close-up's state (which tooth is open, which layer shows) and asks the 3D
   view to move through a ViewDriver, so it runs, and is tested, without WebGL. */

export type InsideMode = 'surface' | 'dentin' | 'pulp'

/** A point on the stage, in CSS pixels from its top left corner; depth is the distance from the camera. */
export interface ScreenSpot {
  x: number
  y: number
  depth: number
}

export interface LandmarkSpot extends ScreenSpot {
  name: string
  /** False when the surface there faces away from the camera. */
  visible: boolean
}

/** What the overlay needs from the 3D view: where to pin labels, and the moves its controls ask for. */
export interface ViewDriver {
  /** Where a tooth's chip goes, or null when that tooth is hidden or faces away. */
  chip(fdi: number): ScreenSpot | null
  /** The open tooth's landmarks, while they are switched on. */
  landmarks(): LandmarkSpot[]
  /** Opens a tooth in the close-up, or closes it: back to where the camera was, or to the rest view on reset. */
  focus(fdi: number | null, back: 'previous' | 'rest'): void
  inside(mode: InsideMode): void
  showLandmarks(on: boolean): void
  /** Below 1 comes closer. */
  zoom(factor: number): void
  /** The tooth under the mouse or with keyboard focus lifts a little; null for none. */
  highlight(fdi: number | null): void
}

export interface Overlay {
  /** Re-pins the chips and landmarks to the frame just drawn. */
  place(): void
  /** The tooth under the mouse, from the view's picking. */
  pointerHover(fdi: number | null): void
  /** A tap on empty canvas. */
  leaveFocus(): void
  /** A plain wheel over the canvas: how to zoom instead. */
  wheelHint(): void
  focused(): number | null
  dispose(): void
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
  /** Higher keeps its place when boxes overlap. */
  priority: number
}

/** The boxes that stay when overlapping ones are dropped, highest priority first (ties: earlier in the list). */
export function cullOverlaps<T extends Box>(boxes: T[], gap = 2): Set<T> {
  const order = boxes.map((box, i) => ({ box, i })).sort((a, b) => b.box.priority - a.box.priority || a.i - b.i)
  const kept: T[] = []
  for (const { box } of order) {
    const clear = kept.every((k) => box.x + box.w + gap <= k.x || k.x + k.w + gap <= box.x || box.y + box.h + gap <= k.y || k.y + k.h + gap <= box.y)
    if (clear) kept.push(box)
  }
  return new Set(kept)
}

const INSIDE: { mode: InsideMode; label: string }[] = [
  { mode: 'surface', label: 'Surface' },
  { mode: 'dentin', label: 'Dentin' },
  { mode: 'pulp', label: 'Pulp and canals' },
]

const TOGGLE = 'min-h-11 rounded-[9px] px-3 text-sm font-semibold aria-pressed:bg-spruce aria-pressed:text-on-spruce'
const QUIET = 'button button--quiet button--small bg-surface whitespace-nowrap max-sm:px-3'
const ICON = (d: string) => `<svg class="size-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`

/* The chips, landmarks and hint cover the canvas exactly (it is 5:4). The controls never sit over the model: the zoom,
   Reset and Landmarks buttons in a row under the canvas, and in the close-up the Inside steps in a row above it. */
const MARKUP = `
  <div class="absolute inset-x-0 top-0 aspect-[5/4] in-data-close-up:top-[3.75rem]">
    <div class="absolute inset-0 overflow-hidden" aria-hidden="true" data-chips></div>
    <div class="absolute inset-0 overflow-hidden" role="group" aria-label="Landmarks" hidden data-landmarks></div>
    <p class="absolute inset-x-0 top-1/2 mx-auto w-max max-w-[90%] -translate-y-1/2 rounded-control bg-spruce px-4 py-2 text-center text-sm text-on-spruce opacity-0 data-shown:opacity-100 motion-safe:transition-opacity" aria-hidden="true" data-wheel-hint>Hold Ctrl or ⌘ and scroll to zoom</p>
  </div>
  <div class="pointer-events-auto absolute top-0 left-0 inline-flex rounded-control border border-line-strong bg-surface p-[3px]" role="group" aria-label="Inside" hidden data-inside>
    ${INSIDE.map(({ mode, label }) => `<button type="button" class="${TOGGLE}" data-inside-mode="${mode}" aria-pressed="${mode === 'surface'}">${label}</button>`).join('')}
  </div>
  <div class="absolute inset-x-0 bottom-0 flex items-end gap-2">
    <button type="button" class="${QUIET} pointer-events-auto aria-pressed:border-spruce aria-pressed:bg-spruce aria-pressed:text-on-spruce" aria-pressed="false" hidden data-landmark-toggle>Landmarks</button>
    <div class="pointer-events-auto ml-auto flex gap-1.5">
      <button type="button" class="${QUIET} w-11 px-0 max-sm:px-0" aria-label="Zoom out" data-zoom="out">${ICON('M5 10h10')}</button>
      <button type="button" class="${QUIET} w-11 px-0 max-sm:px-0" aria-label="Zoom in" data-zoom="in">${ICON('M5 10h10M10 5v10')}</button>
      <button type="button" class="${QUIET}" data-reset>Reset view</button>
    </div>
  </div>`

/* Quiet chips at rest, quieter and smaller on phones; a hovered or focused tooth's is stronger, the chosen one apricot. */
const CHIP =
  'absolute top-0 left-0 rounded-full border border-line bg-surface/85 px-1 font-text text-[0.625rem] leading-4 font-semibold whitespace-nowrap text-sage tabular-nums max-sm:px-0.5 max-sm:text-[0.5625rem] max-sm:leading-[0.8125rem] max-sm:data-[state=quiet]:border-line/60 max-sm:data-[state=quiet]:bg-surface/70 max-sm:data-[state=quiet]:text-sage/75 data-[state=strong]:border-spruce data-[state=strong]:text-spruce data-[state=chosen]:border-spruce data-[state=chosen]:bg-apricot data-[state=chosen]:text-spruce-deep'
const MARK =
  'group/mark pointer-events-auto absolute top-0 left-0 grid size-6 place-items-center rounded-full before:size-2.5 before:rounded-full before:border-2 before:border-surface before:bg-spruce before:content-[""] hover:before:bg-apricot focus-visible:before:bg-apricot'
const MARK_LABEL = 'pointer-events-none absolute top-1/2 left-full ml-1 -translate-y-1/2 rounded-md bg-surface/90 px-1.5 text-xs leading-5 font-semibold whitespace-nowrap text-spruce data-hidden:invisible group-hover/mark:visible group-focus-visible/mark:visible'

const ALL_TEETH = [...ROWS.upper, ...ROWS.lower]

export function mountOverlay(host: ExplorerHost, chart: HTMLElement, driver: ViewDriver): Overlay {
  const layer = document.createElement('div')
  layer.className = 'pointer-events-none absolute inset-0 select-none'
  layer.dataset.modelOverlay = ''
  layer.innerHTML = MARKUP
  chart.append(layer)
  // Room for the control rows: under the canvas always, and above it in the close-up.
  const ROOM = ['pb-[3.25rem]', 'data-close-up:pt-[3.75rem]']
  chart.classList.add(...ROOM)
  const $ = <T extends HTMLElement>(selector: string) => layer.querySelector<T>(selector)!
  const chipLayer = $('[data-chips]')
  const markLayer = $('[data-landmarks]')
  const hint = $('[data-wheel-hint]')
  const insideGroup = $('[data-inside]')
  const landmarkToggle = $<HTMLButtonElement>('[data-landmark-toggle]')

  let open: number | null = null
  let inside: InsideMode = 'surface'
  let landmarksOn = false
  let hovered: number | null = null
  let keyboard: number | null = null

  /* Number chips, one per tooth, sized once per numbering. */
  const chips = new Map<number, { el: HTMLSpanElement; w: number; h: number }>()
  for (const fdi of ALL_TEETH) {
    const el = document.createElement('span')
    el.className = CHIP
    el.hidden = true
    chipLayer.append(el)
    chips.set(fdi, { el, w: 0, h: 0 })
  }
  const label = () => {
    for (const [fdi, chip] of chips) {
      chip.el.textContent = formatTooth(fdi, host.numbering())
      chip.w = 0
    }
  }
  /** jsdom has no layout, so a chip it can't measure gets an estimate from its text. */
  const measure = (chip: { el: HTMLSpanElement; w: number; h: number }) => {
    if (chip.w) return
    chip.w = chip.el.offsetWidth || 8 + 6 * (chip.el.textContent ?? '').length
    chip.h = chip.el.offsetHeight || 18
  }

  /* Landmark buttons for the open tooth. */
  let marks: { el: HTMLButtonElement; text: HTMLSpanElement; w: number }[] = []
  const buildMarks = () => {
    markLayer.replaceChildren()
    marks = []
    if (open === null || !landmarksOn) return
    for (const spot of driver.landmarks()) {
      const el = document.createElement('button')
      el.type = 'button'
      el.className = MARK
      el.setAttribute('aria-label', spot.name)
      const text = document.createElement('span')
      text.className = MARK_LABEL
      text.textContent = spot.name
      text.setAttribute('aria-hidden', 'true')
      el.append(text)
      markLayer.append(el)
      marks.push({ el, text, w: 0 })
    }
  }

  const highlighted = () => keyboard ?? hovered
  const tellHighlight = () => driver.highlight(open === null ? highlighted() : null)

  const place = () => {
    const chosen = host.selected()
    const lit = highlighted()
    const boxes: (Box & { fdi: number })[] = []
    for (const [fdi, chip] of chips) {
      const spot = open === null || fdi === open ? driver.chip(fdi) : null
      if (!spot) {
        chip.el.hidden = true
        continue
      }
      chip.el.hidden = false
      measure(chip)
      chip.el.dataset.state = fdi === chosen ? 'chosen' : fdi === lit ? 'strong' : 'quiet'
      const priority = (fdi === chosen ? 3000 : fdi === lit ? 2000 : 1000) - spot.depth
      boxes.push({ fdi, x: spot.x - chip.w / 2, y: spot.y - chip.h / 2, w: chip.w, h: chip.h, priority })
    }
    // Phones cull harder, so chips never pile up where the back teeth crowd together.
    const kept = cullOverlaps(boxes, window.matchMedia?.('(min-width: 40rem)').matches ? 2 : 8)
    for (const box of boxes) {
      const { el } = chips.get(box.fdi)!
      el.hidden = !kept.has(box)
      el.style.transform = `translate(${Math.round(box.x)}px, ${Math.round(box.y)}px)`
    }
    if (open === null || !landmarksOn) return
    const spots = driver.landmarks()
    const labels: (Box & { i: number })[] = []
    spots.forEach((spot, i) => {
      const mark = marks[i]
      if (!mark) return
      mark.el.hidden = !spot.visible
      mark.el.style.transform = `translate(${Math.round(spot.x - 12)}px, ${Math.round(spot.y - 12)}px)`
      if (!spot.visible) return
      mark.w ||= mark.text.offsetWidth || 8 + 6.2 * spot.name.length
      const lead = mark.el === document.activeElement ? 2000 : 0
      labels.push({ i, x: spot.x - 6, y: spot.y - 10, w: mark.w + 22, h: 20, priority: lead - spot.depth })
    })
    const shown = cullOverlaps(labels, 3)
    for (const box of labels) marks[box.i].text.toggleAttribute('data-hidden', !shown.has(box))
  }

  const setInside = (mode: InsideMode) => {
    inside = mode
    for (const b of insideGroup.querySelectorAll<HTMLButtonElement>('button')) b.setAttribute('aria-pressed', String(b.dataset.insideMode === mode))
    if (open !== null) driver.inside(mode)
  }

  const setLandmarks = (on: boolean) => {
    landmarksOn = on
    landmarkToggle.setAttribute('aria-pressed', String(on))
    markLayer.hidden = !on || open === null
    if (open !== null) driver.showLandmarks(on)
    buildMarks()
    place()
  }

  const enter = (fdi: number) => {
    const first = open === null
    open = fdi
    chart.dataset.closeUp = ''
    insideGroup.hidden = false
    landmarkToggle.hidden = false
    driver.highlight(null)
    driver.focus(fdi, 'previous')
    if (!first) {
      driver.inside(inside)
      driver.showLandmarks(landmarksOn)
    }
    markLayer.hidden = !landmarksOn
    buildMarks()
    place()
  }

  const leave = (back: 'previous' | 'rest') => {
    if (open === null) {
      if (back === 'rest') driver.focus(null, 'rest')
      return
    }
    // A control about to hide hands keyboard focus back to the chart's tooth.
    const hadFocus = layer.contains(document.activeElement) && !layer.querySelector('[data-reset]')?.contains(document.activeElement)
    open = null
    delete chart.dataset.closeUp
    setInside('surface')
    landmarksOn = false
    landmarkToggle.setAttribute('aria-pressed', 'false')
    insideGroup.hidden = true
    landmarkToggle.hidden = true
    markLayer.hidden = true
    buildMarks()
    driver.focus(null, back)
    tellHighlight()
    if (hadFocus) chart.querySelector<SVGGElement>('.tooth[tabindex="0"]')?.focus()
    place()
  }

  const stopListening = host.onChange((change) => {
    if (change === 'numbering') label()
    // Upper teeth or Lower teeth closes the close-up of a tooth on the other arch.
    if (change === 'arch' && open !== null && (Math.floor(open / 10) <= 2 ? 'upper' : 'lower') !== host.arch()) leave('rest')
    if (change === 'select') {
      const fdi = host.selected()
      if (fdi !== null) enter(fdi)
    }
    place()
  })

  const onClick = (event: MouseEvent) => {
    const target = event.target as Element
    const zoom = target.closest<HTMLButtonElement>('[data-zoom]')
    if (zoom) return driver.zoom(zoom.dataset.zoom === 'in' ? 1 / 1.4 : 1.4)
    if (target.closest('[data-reset]')) return leave('rest')
    const mode = target.closest<HTMLButtonElement>('[data-inside-mode]')?.dataset.insideMode
    if (mode === 'surface' || mode === 'dentin' || mode === 'pulp') return setInside(mode)
    if (target.closest('[data-landmark-toggle]')) setLandmarks(!landmarksOn)
  }
  layer.addEventListener('click', onClick)

  // Escape leaves the close-up, unless something else on the page (a dialog) is using it.
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || open === null || event.defaultPrevented || document.querySelector('dialog[open]')) return
    const target = event.target as Node | null
    if (target && target !== document.body && !host.root.contains(target)) return
    event.preventDefault()
    leave('previous')
  }
  document.addEventListener('keydown', onKey)

  /* Keyboard focus on the flat chart's teeth shows on the model as a stronger chip and a lifted tooth. */
  const onFocus = (event: FocusEvent) => {
    const tooth = (event.target as Element | null)?.closest?.<SVGGElement>('.tooth')
    keyboard = tooth ? Number(tooth.dataset.fdi) : null
    tellHighlight()
    place()
  }
  const onBlur = (event: FocusEvent) => {
    if (!(event.relatedTarget as Element | null)?.closest?.('.tooth')) keyboard = null
    tellHighlight()
    place()
  }
  chart.addEventListener('focusin', onFocus)
  chart.addEventListener('focusout', onBlur)
  const onMarkFocus = () => place()
  markLayer.addEventListener('focusin', onMarkFocus)

  let hintTimer = 0
  label()

  return {
    place,
    pointerHover(fdi) {
      if (fdi === hovered) return
      hovered = fdi
      tellHighlight()
      place()
    },
    leaveFocus: () => leave('previous'),
    wheelHint() {
      hint.toggleAttribute('data-shown', true)
      clearTimeout(hintTimer)
      hintTimer = window.setTimeout(() => hint.toggleAttribute('data-shown', false), 1400)
    },
    focused: () => open,
    dispose() {
      clearTimeout(hintTimer)
      stopListening()
      layer.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKey)
      chart.removeEventListener('focusin', onFocus)
      chart.removeEventListener('focusout', onBlur)
      markLayer.removeEventListener('focusin', onMarkFocus)
      chart.classList.remove(...ROOM)
      delete chart.dataset.closeUp
      layer.remove()
    },
  }
}
