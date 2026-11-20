/** Any [data-concept] element opens the About this site dialog, including ones added later. */
export function initConceptDialog(): void {
  const dialog = document.querySelector<HTMLDialogElement>('#concept-dialog')
  if (!dialog) return
  let opener: HTMLElement | null = null

  document.addEventListener('click', (event) => {
    const trigger = (event.target as Element | null)?.closest<HTMLElement>('[data-concept]')
    if (!trigger || dialog.open) return
    opener = trigger
    dialog.showModal()
  })

  dialog.querySelector('[data-concept-close]')?.addEventListener('click', () => dialog.close())

  // The content sits in an inner wrapper, so a click on the dialog itself is the backdrop.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close()
  })

  dialog.addEventListener('close', () => {
    opener?.focus()
    opener = null
  })
}
