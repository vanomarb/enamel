/** null when the browser blocks storage (private modes, blocked site data). */
export function browserStore(): Storage | null {
  try {
    const store = window.localStorage
    const probe = 'enamel.probe'
    store.setItem(probe, '1')
    store.removeItem(probe)
    return store
  } catch {
    return null
  }
}
