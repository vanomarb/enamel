import { readFileSync } from 'node:fs'
import { mock } from 'node:test'
import { JSDOM, VirtualConsole } from 'jsdom'
import { includePartials } from '../build/partials.ts'
import { boot } from '../app/boot.ts'

/* jsdom can't show focus trapping, the scroll lock, CSS or motion: those need a real browser. */

const root = new URL('../app/', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), 'utf8')
const partials = { header: read('components/header.html'), footer: read('components/footer.html'), 'tooth-explorer': read('components/tooth-explorer/tooth-explorer.html') }

/** The clinic's Monday morning, 8:30 AM in Cebu: a fixed "now" so slot lists and Today never depend on the real clock. */
export const MONDAY_MORNING = '2026-11-16T00:30:00Z'

export interface PageOptions {
  /** Storage in place before the page parses, as key to value (values that aren't strings are JSON-encoded). */
  storage?: Record<string, unknown>
  /** The window is at least 53.75rem wide (the phone menu's breakpoint). Default: a phone. */
  wide?: boolean
  /** The visitor asks for reduced motion. Default true. */
  reducedMotion?: boolean
  /** The moment "now" is, as an ISO string. Default: MONDAY_MORNING. */
  now?: string
}

export interface Page {
  window: JSDOM['window']
  document: Document
  /** Runs boot() on this page and returns any start-up errors it logged. */
  boot(): string[]
  $<T extends Element = HTMLElement>(selector: string): T
  $$<T extends Element = HTMLElement>(selector: string): T[]
  click(target: string | Element): void
  /** Types into a field: sets its value and sends an input event. */
  type(selector: string, text: string): void
  key(key: string, target?: Element): void
  /** Submits the form the way a person does, with a cancelable submit event. */
  submit(selector: string): void
  /** Lets jsdom's timers run (the live-region announcements wait 50 to 100 ms). */
  wait(ms?: number): Promise<void>
  /** Moves the window across the phone menu's breakpoint. */
  resize(wide: boolean): void
  storage(key: string): unknown
  /** The text of the element, with runs of white space made single spaces. */
  text(selector: string): string
  close(): void
}

const open: Page[] = []

/** Closes every page opened so far (their timers would otherwise keep the test process alive) and gives the real clock back. */
export function closeAll(): void {
  while (open.length) open.pop()!.close()
  mock.timers.reset()
}

/** Loads a page by its source file, at a URL under /enamel/ (path may carry a query, like 'book/?service=filling'). */
export function loadPage(file: string, path: string, options: PageOptions = {}): Page {
  const { storage = {}, reducedMotion = true, now = MONDAY_MORNING } = options
  let wide = options.wide ?? false
  const mediaListeners = new Set<(event: { matches: boolean }) => void>()
  const virtualConsole = new VirtualConsole()
  const problems: string[] = []
  virtualConsole.on('jsdomError', (error: Error) => problems.push(error.message))

  // The booking and My appointments read the clock with new Date(): fix it, only Date, so timers still run.
  mock.timers.reset()
  mock.timers.enable({ apis: ['Date'], now: new Date(now) })

  const dom = new JSDOM(includePartials(read(file), partials), {
    url: `https://enamel.test/enamel/${path}`,
    pretendToBeVisual: true,
    // Runs the header's inline script as a browser would; boot() stands in for the module script.
    runScripts: 'dangerously',
    virtualConsole,
    beforeParse(window) {
      // Stand-in: matchMedia answers the two queries the scripts ask, and reports breakpoint changes.
      window.matchMedia = ((query: string) => ({
        media: query,
        get matches() {
          if (query.includes('prefers-reduced-motion: reduce')) return reducedMotion
          if (query.includes('min-width: 53.75rem')) return wide
          return false
        },
        addEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => {
          if (query.includes('min-width: 53.75rem')) mediaListeners.add(listener)
        },
        removeEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => mediaListeners.delete(listener),
      })) as unknown as typeof window.matchMedia

      // Stand-in: an IntersectionObserver that never reports, as if nothing scrolled.
      window.IntersectionObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
        takeRecords() {
          return []
        }
      } as unknown as typeof window.IntersectionObserver

      // Stand-in for <dialog>: showModal focuses the autofocus (or first) control; Escape cancels, then closes the top one.
      // It doesn't hand focus back on close: the site's own code must, and the tests check it.
      const dialog = window.HTMLDialogElement.prototype as HTMLDialogElement & Record<string, unknown>
      dialog.showModal = function (this: HTMLDialogElement) {
        if (this.open) throw new window.DOMException('The dialog is already open.', 'InvalidStateError')
        this.setAttribute('open', '')
        const target = this.querySelector<HTMLElement>('[autofocus]') ?? this.querySelector<HTMLElement>('a[href], button, input, select, textarea')
        target?.focus()
      }
      dialog.close = function (this: HTMLDialogElement) {
        if (!this.open) return
        this.removeAttribute('open')
        this.dispatchEvent(new window.Event('close'))
      }
      window.document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return
        const top = [...window.document.querySelectorAll('dialog[open]')].pop() as HTMLDialogElement | undefined
        if (top && top.dispatchEvent(new window.Event('cancel', { cancelable: true }))) top.close()
      })

      // jsdom can't navigate. Links are stopped once every handler on the page has seen the click.
      window.addEventListener('click', (event) => {
        if ((event.target as Element | null)?.closest?.('a[href]')) event.preventDefault()
      })

      for (const [key, value] of Object.entries(storage)) window.localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value))
    },
  })
  const { window } = dom
  const document = window.document

  const page: Page = {
    window,
    document,
    boot() {
      // The feature modules use the browser's globals, so point them at this page.
      Object.assign(globalThis, {
        window,
        document,
        Node: window.Node,
        HTMLDialogElement: window.HTMLDialogElement,
        requestAnimationFrame: window.requestAnimationFrame.bind(window),
        cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
        IntersectionObserver: window.IntersectionObserver,
      })
      const logged: string[] = []
      const original = console.error
      console.error = (...args: unknown[]) => void logged.push(args.map(String).join(' '))
      try {
        boot()
      } finally {
        console.error = original
      }
      return [...logged, ...problems]
    },
    $<T extends Element = HTMLElement>(selector: string) {
      const found = document.querySelector<T>(selector)
      if (!found) throw new Error(`No element matches ${selector}`)
      return found
    },
    $$<T extends Element = HTMLElement>(selector: string) {
      return [...document.querySelectorAll<T>(selector)]
    },
    click(target) {
      const el = typeof target === 'string' ? page.$(target) : target
      el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, composed: true }))
    },
    type(selector, text) {
      const field = page.$<HTMLInputElement>(selector)
      field.value = text
      field.dispatchEvent(new window.Event('input', { bubbles: true }))
    },
    key(key, target = document.activeElement ?? document.body) {
      target.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    },
    submit(selector) {
      page.$(selector).dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
    },
    wait(ms = 120) {
      return new Promise((resolve) => window.setTimeout(resolve, ms))
    },
    resize(next) {
      wide = next
      for (const listener of mediaListeners) listener({ matches: next })
    },
    storage(key) {
      const text = window.localStorage.getItem(key)
      return text === null ? null : JSON.parse(text)
    },
    text(selector) {
      return (page.$(selector).textContent ?? '').replace(/\s+/g, ' ').trim()
    },
    close() {
      window.close()
    },
  }
  open.push(page)
  return page
}
