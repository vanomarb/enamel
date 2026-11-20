import { initConceptDialog } from './shared/concept.ts'
import { initNav } from './shared/nav.ts'
import { initServices } from './treatments/services.ts'
import { initToothExplorer } from './components/tooth-explorer/tooth-explorer.ts'
import { initBooking } from './book/booking.ts'
import { initAccount, initAccountHeader } from './account/account.ts'
import { initMockForms } from './shared/forms.ts'
import { initReveal } from './shared/reveal.ts'

/** Each feature starts on its own, so one that fails leaves the others (and the static page) working. */
function start(name: string, init: () => void): void {
  try {
    init()
  } catch (error) {
    console.error(`Enamel: ${name} could not start.`, error)
  }
}

function mount(selector: string, init: (root: HTMLElement) => void): void {
  const root = document.querySelector<HTMLElement>(selector)
  if (root) start(selector, () => init(root))
}

/** main.ts calls this in the browser; the browser-level tests call it on the real pages in jsdom. */
export function boot(): void {
  start('concept dialog', initConceptDialog)
  start('navigation', initNav)
  start('forms', initMockForms)
  start('scroll reveals', initReveal)
  start('account header', initAccountHeader)
  mount('[data-services]', initServices)
  mount('[data-booking]', initBooking)
  mount('[data-tooth-explorer]', initToothExplorer)
  mount('[data-account]', initAccount)
}
