import { addAppointment, firstWord, loadAppointments, replaceAppointment, type Appointment } from '../lib/account.ts'
import { rescheduleFromSearch, serviceFromSearch } from '../lib/book-link.ts'
import { busyFrom, isPast } from '../lib/diary.ts'
import { formatDay } from '../lib/dates.ts'
import { BASE } from '../lib/base.ts'
import { escapeHtml } from '../lib/format.ts'
import { formatClock, manilaTime } from '../lib/time.ts'
import { GROUPS, SERVICES, checklistFor, durationLabel, priceParts, priceWithUnit, serviceById, type Service } from '../lib/services.ts'
import { ANY_GENERAL, DENTISTS, LUNCH_START, asksForDentist, chairFor, dentistDays, dentistsFor, lunchText, reminderMessage, sixMonthsAfter, timeSlots, validatePatient, weekdayColumn, type PatientErrors } from '../lib/booking.ts'
import { browserStore } from '../shared/storage.ts'

type StepId = 'service' | 'dentist' | 'day' | 'time' | 'details'

const STEPS: { id: StepId; name: string; heading: string }[] = [
  { id: 'service', name: 'Treatment', heading: 'Choose a treatment' },
  { id: 'dentist', name: 'Dentist', heading: 'Choose a dentist' },
  { id: 'day', name: 'Day', heading: 'Choose a day' },
  { id: 'time', name: 'Time', heading: 'Choose a time' },
  { id: 'details', name: 'Your details', heading: 'Patient details' },
]

export interface State {
  step: StepId | 'done'
  serviceId?: string
  dentistId?: string
  day?: string
  start?: number
  name: string
  hmo: string
  tried: boolean
  /** Set when the visitor came from Reschedule; confirming replaces that appointment. */
  rescheduleId?: string
}

/* Each caller passes a complete class string, so Tailwind finds it. */
const unitMarkup = (service: Service, classes: string) => (service.unit ? ` <span class="${classes}">${service.unit}</span>` : '')
const priceMarkup = (service: Service, classes: string) => `<span class="${classes}">starts at</span> ${priceParts(service).amount}${unitMarkup(service, classes)}`
const stepNote = (text: string) => `<p class="text-sm text-sage">${text}</p>`
const stepEmpty = (text: string) => `<p class="rounded-control border border-dashed border-line-strong p-4">${text}</p>`

const fresh = (): State => ({ step: 'service', name: '', hmo: '', tried: false })

const serviceOf = (state: State) => (state.serviceId ? serviceById(state.serviceId) : undefined)
const dentistOf = (state: State) => DENTISTS.find((d) => d.id === state.dentistId)
/** The dentist in words: "Any general dentist" until a time has given the visitor a chair. */
const dentistRole = (state: State) => (state.dentistId === ANY_GENERAL ? 'Any general dentist' : dentistOf(state)?.role ?? '')
const stepsFor = (state: State) => (state.serviceId && !asksForDentist(state.serviceId) ? STEPS.filter((s) => s.id !== 'dentist') : STEPS)

/** The visitor's own bookings as taken chair time; the one being rescheduled doesn't block itself. */
const mineFor = (state: State) => busyFrom(loadAppointments(browserStore()), state.rescheduleId)
const movingNote = (state: State) => (state.rescheduleId ? ' You’re moving an appointment: the old time is released when you confirm.' : '')

function nextIncomplete(state: State): StepId {
  if (!state.serviceId) return 'service'
  if (!state.dentistId) return 'dentist'
  if (!state.day) return 'day'
  if (state.start === undefined) return 'time'
  return 'details'
}

function choiceText(state: State, id: StepId): string {
  const service = serviceOf(state)
  if (id === 'service' && service) return `${service.name}, starts at ${priceWithUnit(service)}`
  if (id === 'dentist') return dentistRole(state)
  if (id === 'day' && state.day) return formatDay(state.day)
  if (id === 'time' && state.start !== undefined) return `${formatClock(state.start)}, Cebu time`
  return ''
}

const choice = (value: string | number, title: string, meta: string, pressed: boolean, extra = '') =>
  `<button type="button" class="option grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-3.5 py-2.5 text-left" data-choose="${value}" aria-pressed="${pressed}"><span class="font-semibold leading-[1.3]">${title}</span><span class="col-start-1 text-sm text-sage">${meta}</span>${extra}</button>`

const choicePrice = (service: Service) =>
  `<span class="col-start-2 row-span-2 row-start-1 grid justify-items-end max-xs:col-start-1 max-xs:row-span-1 max-xs:row-start-3 max-xs:justify-items-start font-display text-lg leading-[1.15] whitespace-nowrap tabular-nums">${priceMarkup(service, 'font-text text-xs text-sage')}</span>`

function serviceBody(state: State): string {
  return GROUPS.map(
    (group) =>
      `<div class="grid gap-2" role="group" aria-labelledby="choose-${group.id}"><p class="text-sm font-semibold text-sage" id="choose-${group.id}">${group.label}</p><div class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,16rem),1fr))] gap-2">${SERVICES.filter(
        (s) => s.group === group.id,
      )
        .map((s) => choice(s.id, s.name, durationLabel(s), state.serviceId === s.id, choicePrice(s)))
        .join('')}</div></div>`,
  ).join('')
}

function dentistBody(state: State): string {
  // Only braces reach this step (see stepsFor).
  const options = dentistsFor(state.serviceId ?? '')
  return (
    stepNote('Braces are with our orthodontist, who is in on Saturdays only.') +
    `<div class="grid max-w-[26rem] grid-cols-[minmax(0,1fr)] gap-2">${options
      .map((d) => choice(d.id, d.role, d.weekdays.length === 1 ? 'Saturdays only' : 'Monday to Saturday', state.dentistId === d.id))
      .join('')}</div>`
  )
}

/* Spelled out whole so Tailwind finds them. */
const COLUMN_START = ['', 'sm:col-start-1', 'sm:col-start-2', 'sm:col-start-3', 'sm:col-start-4', 'sm:col-start-5', 'sm:col-start-6']

function dayBody(state: State, now: Date): string {
  const service = serviceOf(state)
  if (!service || !state.dentistId) return ''
  const who = dentistOf(state)
  const saturdaysOnly = who?.weekdays.length === 1
  const today = manilaTime(now).isoDate
  const mine = mineFor(state)
  const days = dentistDays(now, state.dentistId, saturdaysOnly ? 4 : 12).map((day) => ({
    day,
    free: timeSlots(day, state.dentistId ?? '', service.minutes, now, mine).some((slot) => slot.available),
  }))
  // The button's name is its visible text, so voice control can use it.
  const buttons = days
    .map(({ day, free }, index) => {
      const offset = index === 0 && !saturdaysOnly ? ` ${COLUMN_START[weekdayColumn(day) ?? 0]}` : ''
      return `<button type="button" class="group option grid min-h-16 content-center justify-items-center px-1 py-2 leading-tight${offset}" data-choose="${day}" aria-pressed="${state.day === day}"${free ? '' : ' disabled'}><span class="text-sm text-sage">${day === today ? 'Today' : formatDay(day, 'weekday')}</span> <span class="font-display text-lg group-disabled:line-through">${formatDay(day, 'month-day')}</span>${free ? '' : ` <span class="text-xs text-sage">${day === today ? 'None left' : 'Full'}</span>`}</button>`
    })
    .join('')
  const empty = days.some((d) => d.free) ? '' : stepEmpty('No free days in the next few weeks for this treatment.')
  const grid = saturdaysOnly ? 'grid-cols-[repeat(auto-fill,minmax(4.75rem,1fr))]' : 'grid-cols-3 sm:grid-cols-6'
  return `${stepNote(`${saturdaysOnly ? 'Saturdays only. ' : ''}Closed on Sundays.${movingNote(state)}`)}<div class="grid ${grid} gap-2">${buttons}</div>${empty}`
}

function timeBody(state: State, now: Date): string {
  const service = serviceOf(state)
  if (!service || !state.day || !state.dentistId) return ''
  const clock = manilaTime(now)
  const slots = timeSlots(state.day, state.dentistId, service.minutes, now, mineFor(state))
  const group = (label: string, list: typeof slots) =>
    list.length === 0
      ? ''
      : `<div class="grid gap-2" role="group" aria-labelledby="slots-${label.toLowerCase()}"><p class="text-sm font-semibold text-sage" id="slots-${label.toLowerCase()}">${label}</p><div class="grid grid-cols-[repeat(auto-fill,minmax(5.75rem,1fr))] gap-2">${list
          .map((slot) => {
            const why = slot.yours ? 'already booked by you' : state.day === clock.isoDate && slot.start <= clock.minutes ? 'already passed' : 'taken'
            return `<button type="button" class="option min-h-11 px-2 font-display text-base tabular-nums disabled:line-through" data-choose="${slot.start}" aria-pressed="${state.start === slot.start}"${slot.available ? '' : ' disabled'}>${formatClock(slot.start)}${slot.available ? '' : `<span class="sr-only">, ${why}</span>`}</button>`
          })
          .join('')}</div></div>`
  const empty = slots.some((slot) => slot.available)
    ? ''
    : `${stepEmpty('No free times left on this day. Choose another day.')}<button type="button" class="button button--quiet justify-self-start" data-change="day">Choose another day</button>`
  return `${stepNote(`All times are Cebu time (UTC+8). No appointments from ${lunchText()}.${movingNote(state)}`)}${group('Morning', slots.filter((x) => x.start < LUNCH_START))}${group('Afternoon', slots.filter((x) => x.start >= LUNCH_START))}${empty}`
}

function field(state: State, id: 'name' | 'hmo', label: string, hint: string, autocomplete: string): string {
  return `<div class="grid gap-1"><label class="font-semibold" for="patient-${id}">${label}</label><p class="text-sm text-sage" id="patient-${id}-hint">${hint}</p><input class="mt-1 min-h-12 w-full rounded-control border border-line-strong bg-surface px-3.5 text-base focus-visible:border-spruce focus-visible:outline-offset-1 aria-invalid:border-2 aria-invalid:border-error aria-invalid:px-[calc(0.875rem-1px)]" id="patient-${id}" name="${id}" type="text" autocomplete="${autocomplete}" spellcheck="false" value="${escapeHtml(state[id])}" aria-describedby="patient-${id}-hint"${id === 'name' ? ' required' : ''} /><p class="text-sm font-semibold text-error" id="patient-${id}-error" hidden></p></div>`
}

function detailsBody(state: State): string {
  return (
    `<form class="grid max-w-[30rem] gap-6" data-details novalidate>` +
    field(state, 'name', 'Patient’s name', 'The name we’d write on the appointment.', 'name') +
    field(state, 'hmo', 'HMO provider (optional)', 'As printed on the card. Leave it blank if you’re paying yourself.', 'off') +
    `<button type="submit" class="button button--primary button--large justify-self-start">Confirm booking</button></form>`
  )
}

function bodyFor(id: StepId, state: State, now: Date): string {
  if (id === 'service') return serviceBody(state)
  if (id === 'dentist') return dentistBody(state)
  if (id === 'day') return dayBody(state, now)
  if (id === 'time') return timeBody(state, now)
  return detailsBody(state)
}

function stepperMarkup(state: State, now: Date): string {
  const steps = stepsFor(state)
  const current = steps.findIndex((s) => s.id === state.step)
  const marker = '<span class="step__marker" aria-hidden="true"></span>'
  const head = 'flex min-h-7.5 items-center gap-3'
  return steps.map((step, index) => {
    if (index < current) {
      return `<li class="step is-done"><div class="${head}">${marker}<div class="grid min-w-0 flex-1"><span class="font-semibold">${step.name}</span><span class="text-sm text-sage">${choiceText(state, step.id)}</span></div><button type="button" class="min-h-11 flex-none px-2 text-sm font-semibold underline decoration-1 underline-offset-[0.2em]" data-change="${step.id}">Change<span class="sr-only"> ${step.name.toLowerCase()}</span></button></div></li>`
    }
    if (index === current) {
      return `<li class="step is-current" aria-current="step"><div class="${head}">${marker}<h3 class="focus-visible:rounded-[4px] focus-visible:outline-offset-4" tabindex="-1"><span class="sr-only">Step ${index + 1} of ${steps.length}: </span>${step.heading}</h3></div><div class="grid gap-4 pt-4 max-sm:-ml-10 motion-safe:in-data-moved:animate-panel-in">${bodyFor(step.id, state, now)}</div></li>`
    }
    return `<li class="step is-upcoming"><div class="${head}">${marker}<span class="text-sage">${step.name}</span></div></li>`
  }).join('')
}

export function doneMarkup(state: State, saved: boolean): string {
  const moved = !!state.rescheduleId
  const service = serviceOf(state)
  if (!service || !state.dentistId || !state.day || state.start === undefined) return ''
  const firstName = firstWord(state.name)
  const hmo = state.hmo.trim()
  const rows: [string, string][] = [
    ['Treatment', service.name],
    ['Starts at', `${priceParts(service).amount}${unitMarkup(service, 'text-sm text-sage')}`],
    ['Dentist', dentistRole(state)],
    ['When', `${formatDay(state.day)}, ${formatClock(state.start)} (Cebu time)`],
    ['Patient', escapeHtml(state.name.trim())],
    ...(hmo ? ([['HMO', escapeHtml(hmo)]] as [string, string][]) : []),
  ]
  return (
    `<h3 class="flex items-center gap-3 before:size-3 before:flex-none before:rounded-full before:bg-apricot" tabindex="-1">${moved ? 'Appointment moved' : 'Booking ready'}. Nothing was sent.</h3>` +
    `<p>This is a demonstration site, so this booking stays in your browser: no one received it, and no reminder is scheduled.${saved ? ` It’s listed under <a class="font-semibold underline decoration-1 underline-offset-[0.2em] hover:decoration-2" href="${BASE}account/">My appointments</a> on this device.` : ''}</p>` +
    `<dl class="border-t border-line">${rows.map(([term, value]) => `<div class="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-4 border-b border-line py-2"><dt class="text-sm text-sage">${term}</dt><dd>${value}</dd></div>`).join('')}</dl>` +
    `<section class="rounded-surface border border-line bg-porcelain p-6" aria-labelledby="reminder-title"><h4 class="font-text text-sm font-semibold" id="reminder-title">Six-month reminder, previewed</h4>` +
    `<blockquote class="my-2 font-display text-lg leading-[1.45]"><p>${escapeHtml(reminderMessage(firstName))}</p></blockquote>` +
    `<p class="text-sm text-sage">A real clinic would send this on ${formatDay(sixMonthsAfter(state.day), 'long-year')}.</p></section>` +
    (hmo
      ? `<section class="grid gap-3" aria-labelledby="checklist-title"><h4 class="font-text text-sm font-semibold" id="checklist-title">HMO checklist for this visit</h4><ul class="check-list">${checklistFor(service.id, hmo).map((line) => `<li>${line}</li>`).join('')}</ul></section>`
      : '<p class="text-sm text-sage">Paying without an HMO? GCash, Maya, cards and cash are all fine.</p>') +
    `<button type="button" class="button button--quiet justify-self-start" data-again>Book another visit</button>`
  )
}

/**
 * The stepper's first state: book/index.html carries this exact markup (tests/static-shells.test.ts checks).
 * Step one doesn't depend on the date, so any date will do.
 */
export function bookingShellMarkup(): string {
  return `<ol class="in-data-booking-pending:invisible" data-stepper>${stepperMarkup(fresh(), new Date(0))}</ol><div class="grid gap-4 motion-safe:in-data-moved:animate-panel-in" data-done hidden></div><p class="sr-only" aria-live="polite" data-booking-status></p>`
}

export function initBooking(root: HTMLElement): void {
  if (!root.querySelector('[data-stepper]')) root.insertAdjacentHTML('beforeend', bookingShellMarkup())
  const stepper = root.querySelector<HTMLElement>('[data-stepper]')
  const done = root.querySelector<HTMLElement>('[data-done]')
  const status = root.querySelector<HTMLElement>('[data-booking-status]')
  if (!stepper || !done || !status) return
  let state = fresh()
  let saved = false

  const render = (focus: boolean, preventScroll = false) => {
    // Only renders that answer the visitor animate.
    if (focus) root.setAttribute('data-moved', '')
    status.textContent = ''
    if (state.step === 'done') {
      stepper.hidden = true
      done.hidden = false
      done.innerHTML = doneMarkup(state, saved)
      if (focus) done.querySelector<HTMLElement>('h3')?.focus({ preventScroll })
      return
    }
    stepper.hidden = false
    done.hidden = true
    stepper.innerHTML = stepperMarkup(state, new Date())
    if (focus) stepper.querySelector<HTMLElement>('[aria-current="step"] h3')?.focus({ preventScroll })
  }

  const showErrors = (form: HTMLFormElement, errors: PatientErrors) => {
    for (const id of ['name', 'hmo'] as const) {
      const input = form.querySelector<HTMLInputElement>(`#patient-${id}`)
      const error = form.querySelector<HTMLElement>(`#patient-${id}-error`)
      if (!input || !error) continue
      const message = errors[id]
      error.hidden = !message
      error.textContent = message ?? ''
      if (message) input.setAttribute('aria-invalid', 'true')
      else input.removeAttribute('aria-invalid')
      input.setAttribute('aria-describedby', `patient-${id}-hint${message ? ` patient-${id}-error` : ''}`)
    }
  }

  const choose = (value: string) => {
    switch (state.step) {
      case 'service':
        if (value !== state.serviceId) {
          state.serviceId = value
          if (!asksForDentist(value)) state.dentistId = ANY_GENERAL
          else if (!dentistsFor(value).some((d) => d.id === state.dentistId)) state.dentistId = undefined
          state.day = undefined
          state.start = undefined
        }
        break
      case 'dentist':
        if (value !== state.dentistId) {
          state.dentistId = value
          state.day = undefined
          state.start = undefined
        }
        break
      case 'day':
        if (value !== state.day) {
          state.day = value
          state.start = undefined
        }
        break
      case 'time': {
        const start = Number(value)
        const minutes = serviceOf(state)?.minutes ?? 0
        const stillFree = timeSlots(state.day ?? '', state.dentistId ?? '', minutes, new Date(), mineFor(state)).some((s) => s.start === start && s.available)
        if (!stillFree) {
          render(true)
          // Set after the render cleared it, so the same message is announced again if it repeats.
          window.setTimeout(() => {
            status.textContent = 'That time has just passed. Choose another time.'
          }, 100)
          return
        }
        state.start = start
        break
      }
      default:
        return
    }
    state.step = nextIncomplete(state)
    render(true)
  }

  root.addEventListener('click', (event) => {
    const target = event.target as Element
    const option = target.closest<HTMLButtonElement>('[data-choose]')
    if (option && !option.disabled && option.dataset.choose) return choose(option.dataset.choose)
    const change = target.closest<HTMLButtonElement>('[data-change]')
    if (change) {
      state.step = change.dataset.change as StepId
      return render(true)
    }
    if (target.closest('[data-again]')) {
      state = fresh()
      render(true)
    }
  })

  root.addEventListener('input', (event) => {
    const input = event.target as HTMLInputElement
    if (input.name !== 'name' && input.name !== 'hmo') return
    state[input.name] = input.value
    if (state.tried && input.form) showErrors(input.form, validatePatient(state))
  })

  root.addEventListener('submit', (event) => {
    event.preventDefault()
    const form = event.target as HTMLFormElement
    state.tried = true
    const errors = validatePatient(state)
    showErrors(form, errors)
    const firstInvalid = (['name', 'hmo'] as const).find((id) => errors[id])
    if (firstInvalid) {
      form.querySelector<HTMLInputElement>(`#patient-${firstInvalid}`)?.focus()
      return
    }
    // The tab may have been open a while: check the chosen time is still free before confirming it.
    if (state.serviceId && state.dentistId && state.day && state.start !== undefined) {
      const minutes = serviceOf(state)?.minutes ?? 0
      const start = state.start
      const chair = chairFor(state.day, state.dentistId, start, minutes, new Date(), mineFor(state))
      if (!chair) {
        state.start = undefined
        state.step = 'time'
        render(true)
        window.setTimeout(() => {
          status.textContent = 'That time is no longer free. Choose another time.'
        }, 100)
        return
      }
      state.dentistId = chair
      const save = state.rescheduleId ? (store: ReturnType<typeof browserStore>, a: Appointment) => replaceAppointment(store, state.rescheduleId ?? '', a) : addAppointment
      saved = save(browserStore(), {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        serviceId: state.serviceId,
        dentistId: state.dentistId,
        day: state.day,
        start: state.start,
        patient: state.name.trim(),
        hmo: state.hmo.trim(),
      })
    }
    state.step = 'done'
    render(true)
  })

  // ?service= preselects a treatment (the head script hides the stepper meanwhile); &reschedule=<id> also fills in
  // the patient and dentist, unless that appointment is gone or past.
  const preselected = serviceFromSearch(window.location.search)
  const moving = rescheduleFromSearch(window.location.search)
  const previous = moving ? loadAppointments(browserStore()).find((a) => a.id === moving && a.serviceId === preselected && !isPast(a, new Date())) : undefined
  if (preselected && previous) {
    state = { ...fresh(), serviceId: preselected, name: previous.patient, hmo: previous.hmo, rescheduleId: previous.id }
    if (!asksForDentist(preselected)) state.dentistId = ANY_GENERAL
    else if (dentistsFor(preselected).some((d) => d.id === previous.dentistId)) state.dentistId = previous.dentistId
    state.step = nextIncomplete(state)
    render(false)
  } else if (preselected) {
    state = { ...fresh(), serviceId: preselected }
    if (!asksForDentist(preselected)) state.dentistId = ANY_GENERAL
    state.step = nextIncomplete(state)
    render(false)
  }
  document.documentElement.removeAttribute('data-booking-pending')
}
