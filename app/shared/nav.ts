import { clinicDay } from '../lib/booking.ts'

/** The header's hairline on scroll, and the phone menu drawer. */
export function initNav(): void {
  const header = document.querySelector<HTMLElement>('[data-header]')
  if (!header) return

  const sentinel = document.createElement('div')
  sentinel.className = 'pointer-events-none absolute top-0 left-0 h-6 w-px'
  sentinel.setAttribute('aria-hidden', 'true')
  document.body.prepend(sentinel)
  new IntersectionObserver(([entry]) => header.toggleAttribute('data-compact', !entry.isIntersecting)).observe(sentinel)

  const button = header.querySelector<HTMLButtonElement>('[data-menu-button]')
  const menu = document.getElementById(button?.getAttribute('aria-controls') ?? '')
  if (!button || !(menu instanceof HTMLDialogElement) || typeof menu.showModal !== 'function') return
  const wide = window.matchMedia('(min-width: 53.75rem)')

  const fillToday = () => {
    const today = clinicDay(new Date())
    const set = (selector: string, text: string) => {
      const el = menu.querySelector<HTMLElement>(selector)
      if (el) el.textContent = text
    }
    set('[data-today-label]', today.label)
    set('[data-today-hours]', today.hours)
    set('[data-today-note]', today.note)
  }

  button.addEventListener('click', () => {
    if (menu.open) return
    fillToday()
    menu.showModal()
    button.setAttribute('aria-expanded', 'true')
  })

  menu.addEventListener('close', () => {
    button.setAttribute('aria-expanded', 'false')
    // Past the breakpoint the button is hidden, so focus has nowhere useful to go back to.
    if (!wide.matches) button.focus()
  })

  // The drawer's content fills the whole dialog, so a click that lands on the dialog element itself is the scrim.
  menu.addEventListener('click', (event) => {
    if (event.target === menu || (event.target as Element).closest('a, [data-menu-close]')) menu.close()
  })

  wide.addEventListener('change', () => {
    if (wide.matches && menu.open) menu.close()
  })
}
