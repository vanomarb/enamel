/** The filter itself is CSS; this announces the count and sets data-filtering so later changes fade in. */
export function initServices(root: HTMLElement): void {
  const status = root.querySelector<HTMLElement>('[data-filter-status]')
  if (!status) return

  root.addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement
    if (input.name !== 'service-filter') return
    root.setAttribute('data-filtering', '')
    const all = input.value === 'all'
    const count = root.querySelectorAll(all ? '[data-service]' : `[data-group="${input.value}"] [data-service]`).length
    const label = input.nextElementSibling?.textContent ?? input.value
    status.textContent = all ? `Showing all ${count} treatments` : `Showing ${count} in ${label}`
  })
}
