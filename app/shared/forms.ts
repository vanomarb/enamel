import { firstWord } from '../lib/account.ts'
import { formProblems } from '../lib/mock-form.ts'

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

/** Shows or clears a field's message in its own `<id>-error` element, linked with aria-describedby. */
function setError(field: Field, message: string | null): void {
  const error = field.id ? field.form?.querySelector<HTMLElement>(`#${field.id}-error`) : null
  if (message) field.setAttribute('aria-invalid', 'true')
  else field.removeAttribute('aria-invalid')
  if (!error) return
  error.hidden = !message
  error.textContent = message ?? ''
  const others = field.getAttribute('aria-describedby')?.split(' ').filter((id) => id && id !== error.id) ?? []
  if (message) others.push(error.id)
  if (others.length) field.setAttribute('aria-describedby', others.join(' '))
  else field.removeAttribute('aria-describedby')
}

/** Checks every form[data-mock-form] on the page, footer included, then says that nothing was sent. */
export function initMockForms(): void {
  // A flagged field's message goes as soon as the field is right.
  document.addEventListener('input', (event) => {
    const field = event.target as Field | null
    if (!field?.form?.matches('form[data-mock-form]') || !field.hasAttribute('aria-invalid')) return
    setError(field, formProblems([{ name: field.name, required: field.required, value: field.value }])[field.name] ?? null)
  })
  document.addEventListener('submit', (event) => {
    const form = (event.target as Element | null)?.closest<HTMLFormElement>('form[data-mock-form]')
    if (!form) return
    event.preventDefault()
    const status = form.querySelector<HTMLElement>('[data-form-status]')
    const fields = [...form.querySelectorAll<Field>('input, textarea, select')]
    const problems = formProblems(fields.map((field) => ({ name: field.name, required: field.required, value: field.value })))
    for (const field of fields) setError(field, problems[field.name] ?? null)
    const first = fields.find((field) => problems[field.name])
    if (first) {
      if (status) status.textContent = ''
      first.focus()
      return
    }
    const name = firstWord((form.elements.namedItem('name') as HTMLInputElement | null)?.value ?? '')
    if (status) {
      status.textContent =
        form.dataset.mockForm === 'contact'
          ? `Thanks${name ? `, ${name}` : ''}. This is a demonstration site, so your message wasn’t sent.`
          : 'Thanks. This is a demonstration site, so your address wasn’t sent or kept.'
    }
    form.reset()
  })
}
