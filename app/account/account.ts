import {
  appointmentDetails,
  clearSession,
  codeMatches,
  demoCode,
  firstWord,
  loadAppointments,
  loadSession,
  maskContact,
  parseContact,
  removeAppointment,
  removeEverything,
  saveSession,
  validateFirstName,
  type Appointment,
  type Session,
} from '../lib/account.ts'
import { BASE } from '../lib/base.ts'
import { splitAppointments } from '../lib/diary.ts'
import { escapeHtml } from '../lib/format.ts'
import { browserStore } from '../shared/storage.ts'

/** Sets data-signed-in and --account-name on <html>, as the header partial's script does at the first paint. */
export function syncAccount(session: Session | null): void {
  const root = document.documentElement
  const name = session ? firstWord(session.firstName) : ''
  root.toggleAttribute('data-signed-in', !!name)
  if (name) root.style.setProperty('--account-name', `"${name}"`)
  else root.style.removeProperty('--account-name')
  for (const link of document.querySelectorAll<HTMLElement>('[data-header] a[data-page="account"]')) {
    if (name) link.setAttribute('aria-label', `Account, signed in as ${name}`)
    else link.removeAttribute('aria-label')
  }
}

export function initAccountHeader(): void {
  syncAccount(loadSession(browserStore()))
}

const BUTTON_SMALL = 'button button--quiet button--small'

/* One record that can't be shown never stops the others. */
function appointmentMarkup(a: Appointment, past = false): string {
  try {
    return appointmentRow(a, past)
  } catch {
    return ''
  }
}

function appointmentRow(a: Appointment, past: boolean): string {
  const d = appointmentDetails(a)
  if (!d) return ''
  const id = escapeHtml(d.id)
  const row = (term: string, value: string) => `<div class="grid gap-x-4 border-b border-line py-2 sm:grid-cols-[8rem_minmax(0,1fr)]"><dt class="text-sm text-sage">${term}</dt><dd>${value}</dd></div>`
  return (
    `<li><details class="disclosure" data-appointment="${id}">` +
    `<summary class="grid gap-0.5"><span class="font-semibold">${d.treatment}</span><span class="text-sm text-sage">${d.when}</span></summary>` +
    `<div class="grid gap-6 pb-6">` +
    `<dl class="border-t border-line">${row('Treatment', d.treatment)}${row('Price from', d.price)}${row('Dentist', d.dentist)}${row('When', `${d.when} (Cebu time)`)}${row('Takes', d.duration)}${row('Patient', escapeHtml(d.patient))}${d.hmo ? row('HMO', escapeHtml(d.hmo)) : ''}</dl>` +
    (past
      ? ''
      : (d.checklist.length ? `<section class="grid gap-3"><h3 class="font-text text-sm font-semibold">HMO checklist for this visit</h3><ul class="check-list">${d.checklist.map((line) => `<li>${line}</li>`).join('')}</ul></section>` : '') +
        `<section class="rounded-surface border border-line bg-porcelain p-5"><h3 class="font-text text-sm font-semibold">Six-month reminder, previewed</h3>` +
        `<blockquote class="my-2 font-display text-lg leading-[1.45]"><p>${escapeHtml(d.reminder)}</p></blockquote><p class="text-sm text-sage">A real clinic would send this on ${d.reminderOn}.</p></section>`) +
    (past ? '' : `<div class="button-row" data-appointment-actions><a class="${BUTTON_SMALL}" href="${d.rescheduleHref(BASE)}">Reschedule<span class="sr-only"> ${d.treatment}</span></a>` +
    `<button type="button" class="${BUTTON_SMALL}" data-cancel="${id}">Cancel appointment<span class="sr-only">: ${d.treatment}, ${d.when}</span></button></div>` +
    `<div class="grid gap-3 rounded-control border border-line-strong bg-surface p-4" role="group" aria-labelledby="cancel-${id}" data-cancel-confirm hidden>` +
    `<p class="font-semibold" id="cancel-${id}" tabindex="-1">Cancel this appointment?</p><p class="text-sm text-sage">This is a demonstration site, so nothing is sent and no one is told. It’s removed from this list.</p>` +
    `<div class="button-row"><button type="button" class="button button--primary button--small" data-cancel-yes="${id}">Yes, cancel it</button><button type="button" class="${BUTTON_SMALL}" data-cancel-keep>Keep it</button></div></div>`) +
    `</div></details></li>`
  )
}

export function initAccount(root: HTMLElement): void {
  const store = browserStore()
  const contactForm = root.querySelector<HTMLFormElement>('[data-signin="contact"]')
  const codeForm = root.querySelector<HTMLFormElement>('[data-signin="code"]')
  const contactStep = root.querySelector<HTMLElement>('[data-signin-step="contact"]')
  const codeStep = root.querySelector<HTMLElement>('[data-signin-step="code"]')
  const summary = root.querySelector<HTMLElement>('[data-signin-summary]')
  const list = root.querySelector<HTMLElement>('[data-appointments]')
  const pastList = root.querySelector<HTMLElement>('[data-appointments-past]')
  const pastBlock = root.querySelector<HTMLElement>('[data-past]')
  const empty = root.querySelector<HTMLElement>('[data-appointments-empty]')
  const status = root.querySelector<HTMLElement>('[data-account-status]')
  const wipe = root.querySelector<HTMLButtonElement>('[data-wipe]')
  const wipeConfirm = root.querySelector<HTMLElement>('[data-wipe-confirm]')
  const removed = root.querySelector<HTMLElement>('[data-removed]')
  if (!contactForm || !codeForm || !contactStep || !codeStep || !list || !pastList || !pastBlock || !empty || !status) return
  const out = (selector: string) => root.querySelector<HTMLElement>(selector)
  let memory: Session | null = null
  let pending: { session: Session; code: string } | null = null

  const announce = (message: string) => {
    status.textContent = ''
    window.setTimeout(() => (status.textContent = message), 50)
  }

  const setError = (form: HTMLFormElement, name: string, message: string | null) => {
    const input = form.querySelector<HTMLInputElement>(`[name="${name}"]`)
    const error = input && form.querySelector<HTMLElement>(`#${input.id}-error`)
    if (!input || !error) return
    error.hidden = !message
    error.textContent = message ?? ''
    if (message) input.setAttribute('aria-invalid', 'true')
    else input.removeAttribute('aria-invalid')
    const hint = input.getAttribute('aria-describedby')?.split(' ').filter((id) => id !== error.id) ?? []
    if (message) hint.push(error.id)
    if (hint.length) input.setAttribute('aria-describedby', hint.join(' '))
    else input.removeAttribute('aria-describedby')
  }

  const render = () => {
    const session = loadSession(store) ?? memory
    syncAccount(session)
    if (!session) return
    const name = out('[data-account-name]')
    const contact = out('[data-account-contact]')
    if (name) name.textContent = session.firstName
    if (contact) contact.textContent = `Signed in with ${maskContact(session.contact)}`
    const { upcoming, past } = splitAppointments(loadAppointments(store), new Date())
    list.innerHTML = upcoming.map((a) => appointmentMarkup(a)).join('')
    pastList.innerHTML = past.map((a) => appointmentMarkup(a, true)).join('')
    pastBlock.hidden = past.length === 0
    empty.hidden = upcoming.length > 0
  }

  const showStep = (step: 'contact' | 'code') => {
    const onCode = step === 'code'
    contactStep.classList.toggle('is-current', !onCode)
    contactStep.classList.toggle('is-done', onCode)
    codeStep.classList.toggle('is-current', onCode)
    codeStep.classList.toggle('is-upcoming', !onCode)
    ;(onCode ? contactStep : codeStep).removeAttribute('aria-current')
    ;(onCode ? codeStep : contactStep).setAttribute('aria-current', 'step')
    contactForm.hidden = onCode
    codeForm.hidden = !onCode
  }

  contactForm.addEventListener('submit', (event) => {
    event.preventDefault()
    const firstName = (contactForm.elements.namedItem('first-name') as HTMLInputElement).value
    const contactText = (contactForm.elements.namedItem('contact') as HTMLInputElement).value
    const nameError = validateFirstName(firstName)
    const contact = parseContact(contactText)
    const contactError = contact ? null : contactText.trim() ? 'Enter an email address, or a mobile number that starts with 09.' : 'Enter your email address or mobile number.'
    setError(contactForm, 'first-name', nameError)
    setError(contactForm, 'contact', contactError)
    if (nameError || !contact) {
      contactForm.querySelector<HTMLInputElement>(nameError ? '[name="first-name"]' : '[name="contact"]')?.focus()
      return
    }
    pending = { session: { firstName: firstName.trim(), contact }, code: demoCode() }
    const code = out('[data-demo-code]')
    const where = out('[data-code-contact]')
    if (code) code.textContent = pending.code
    if (where) where.textContent = maskContact(contact)
    if (summary) summary.textContent = `${firstWord(pending.session.firstName)}, with ${maskContact(contact)}`
    setError(codeForm, 'code', null)
    codeForm.reset()
    showStep('code')
    // The field takes focus so its label and the demo code (aria-describedby) are read with it.
    codeForm.querySelector<HTMLInputElement>('[name="code"]')?.focus()
  })

  codeForm.addEventListener('submit', (event) => {
    event.preventDefault()
    if (!pending) return showStep('contact')
    const entered = (codeForm.elements.namedItem('code') as HTMLInputElement).value
    if (!codeMatches(entered, pending.code)) {
      setError(codeForm, 'code', entered.trim() ? 'That isn’t the code shown above. Check the four digits and try again.' : 'Enter the four digits shown above.')
      codeForm.querySelector<HTMLInputElement>('[name="code"]')?.focus()
      return
    }
    if (removed) removed.hidden = true
    const saved = saveSession(store, pending.session)
    memory = saved ? null : pending.session
    pending = null
    contactForm.reset()
    showStep('contact')
    render()
    out('#account-greeting')?.focus()
    announce(saved ? 'Signed in.' : 'Signed in. Your browser isn’t keeping site data, so you’ll be signed out when you leave this page.')
  })

  root.querySelector('[data-signin-back]')?.addEventListener('click', () => {
    pending = null
    showStep('contact')
    contactForm.querySelector<HTMLInputElement>('[name="contact"]')?.focus()
  })

  const showSignedOut = () => {
    memory = null
    pending = null
    syncAccount(null)
    list.innerHTML = ''
    pastList.innerHTML = ''
    pastBlock.hidden = true
    if (wipeConfirm) wipeConfirm.hidden = true
    showStep('contact')
    contactForm.querySelector<HTMLInputElement>('[name="first-name"]')?.focus()
  }

  root.querySelector('[data-signout]')?.addEventListener('click', () => {
    clearSession(store)
    showSignedOut()
    announce('Signed out.')
  })

  wipe?.addEventListener('click', () => {
    if (!wipeConfirm) return
    wipeConfirm.hidden = false
    wipeConfirm.querySelector<HTMLElement>('[tabindex="-1"]')?.focus()
  })
  root.querySelector('[data-wipe-keep]')?.addEventListener('click', () => {
    if (wipeConfirm) wipeConfirm.hidden = true
    wipe?.focus()
  })
  root.querySelector('[data-wipe-yes]')?.addEventListener('click', () => {
    removeEverything(store)
    showSignedOut()
    if (removed) removed.hidden = false
    announce('Removed. Everything this site kept in your browser is gone: appointments, past visits and your sign-in.')
  })

  list.addEventListener('click', (event) => {
    const target = event.target as Element
    const item = target.closest<HTMLElement>('details')
    const confirm = item?.querySelector<HTMLElement>('[data-cancel-confirm]')
    const actions = item?.querySelector<HTMLElement>('[data-appointment-actions]')
    if (target.closest('[data-cancel]') && confirm && actions) {
      confirm.hidden = false
      actions.hidden = true
      confirm.querySelector<HTMLElement>('[tabindex="-1"]')?.focus()
      return
    }
    if (target.closest('[data-cancel-keep]') && confirm && actions) {
      confirm.hidden = true
      actions.hidden = false
      actions.querySelector<HTMLElement>('[data-cancel]')?.focus()
      return
    }
    const yes = target.closest<HTMLButtonElement>('[data-cancel-yes]')
    if (yes?.dataset.cancelYes) {
      removeAppointment(store, yes.dataset.cancelYes)
      render()
      out('#account-greeting')?.focus()
      announce('Appointment cancelled. This is a demonstration site, so nothing was sent.')
    }
  })

  render()
}
