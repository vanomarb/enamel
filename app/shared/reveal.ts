/** Must match the held selectors in main.css (tests/motion.test.ts checks). */
const BLOCKS = 'main > section:not(:first-child) > div > *, main > div:not(:first-child) > *'
const STAGGER_MS = 70
const MAX_STAGGERED = 8

export function initReveal(): void {
  const root = document.documentElement
  // Ready only once the observer is in place: if this fails, the header script's 3 s fallback shows everything.
  const ready = () => root.setAttribute('data-reveal-ready', '')
  if (!root.classList.contains('js') || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return ready()
  const blocks = [...document.querySelectorAll<HTMLElement>(BLOCKS)]

  const reveal = (block: HTMLElement) => {
    block.classList.add('is-revealed')
    const groups = [...(block.matches('[data-reveal-items]') ? [block] : []), ...block.querySelectorAll<HTMLElement>('[data-reveal-items]')]
    for (const group of groups) {
      ;[...group.children].forEach((item, index) => {
        const el = item as HTMLElement
        el.style.setProperty('--reveal-delay', `${Math.min(index, MAX_STAGGERED) * STAGGER_MS}ms`)
        el.classList.add('is-revealed')
      })
    }
  }

  if (!('IntersectionObserver' in window)) {
    blocks.forEach(reveal)
    return ready()
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        reveal(entry.target as HTMLElement)
        observer.unobserve(entry.target)
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0 },
  )
  for (const block of blocks) observer.observe(block)
  ready()
}
