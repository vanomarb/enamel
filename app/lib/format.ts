const wholeNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

/** Pesos without decimals, e.g. 1290 → "₱1,290". */
export function peso(amount: number): string {
  return `₱${wholeNumber.format(amount)}`
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)
}
