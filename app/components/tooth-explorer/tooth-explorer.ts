import { bookingHref } from '../../lib/book-link.ts'
import { BASE } from '../../lib/base.ts'
import { durationLabel, priceParts, serviceById, type Service } from '../../lib/services.ts'
import { toothByFdi, toothName, treatmentsFor, type ToothType } from '../../lib/teeth.ts'

type Arch = 'upper' | 'lower'

/** Teeth left to right as drawn. The chart faces you, so the patient's right side is on the left. */
const ROWS: Record<Arch, number[]> = {
  upper: [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28],
  lower: [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38],
}

const TYPE_LABEL: Record<ToothType, string> = {
  incisor: 'an incisor',
  canine: 'a canine',
  premolar: 'a premolar',
  molar: 'a molar',
  wisdom: 'a wisdom tooth',
}

const LIST_GROUPS: { title: string; text: string; types: ToothType[] }[] = [
  { title: 'Front teeth', text: 'Incisors and canines, the twelve teeth at the front of your mouth.', types: ['incisor', 'canine'] },
  { title: 'Premolars', text: 'Eight teeth, two behind each canine.', types: ['premolar'] },
  { title: 'Molars', text: 'Eight broad back teeth for chewing, two behind each pair of premolars.', types: ['molar'] },
  { title: 'Wisdom teeth', text: 'The last molar at each end, if yours have come in.', types: ['wisdom'] },
]

/* Chart units. Teeth sit on a half ellipse by arc length; position 1 is the central incisor, 8 the wisdom tooth. */
const SIZE: Record<number, [number, number]> = { 1: [30, 34], 2: [26, 32], 3: [28, 34], 4: [28, 36], 5: [28, 36], 6: [36, 40], 7: [34, 39], 8: [31, 37] }
const INNER: Record<number, [number, number, number]> = { 4: [12, 14, 4.6], 5: [12, 14, 4.6], 6: [18, 20, 6], 7: [17, 19.5, 5.8], 8: [15.5, 18.5, 5.2] }
const GAP = 3
const RX = 127
const RY = 205

interface Placed {
  fdi: number
  x: number
  y: number
  w: number
  d: number
  angle: number
  nx: number
  ny: number
}

const round = (n: number) => Math.round(n * 10) / 10

const ARCH_CLASS: Record<Arch, string> = {
  upper: 'h-auto w-full overflow-visible max-sm:group-data-[arch=lower]/explorer:hidden',
  lower: 'h-auto w-full overflow-visible max-sm:group-data-[arch=upper]/explorer:hidden',
}

function layArch(arch: Arch): Placed[] {
  const steps = 1200
  const points: { t: number; x: number; y: number }[] = []
  const lengths = [0]
  for (let i = 0; i <= steps; i++) {
    const t = -Math.PI / 2 + (Math.PI * i) / steps
    points.push({ t, x: RX * Math.sin(t), y: RY * (1 - Math.cos(t)) })
    if (i > 0) lengths.push(lengths[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y))
  }
  const row = ROWS[arch]
  const needed = row.reduce((sum, fdi) => sum + SIZE[fdi % 10][0], 0) + GAP * (row.length - 1)
  let along = (lengths[steps] - needed) / 2
  const pointAt = (target: number) => {
    let i = lengths.findIndex((l) => l >= target)
    if (i < 1) i = 1
    const f = (target - lengths[i - 1]) / (lengths[i] - lengths[i - 1])
    const a = points[i - 1]
    const b = points[i]
    return { t: a.t, x: a.x + f * (b.x - a.x), y: a.y + f * (b.y - a.y) }
  }
  return row.map((fdi) => {
    const [w, d] = SIZE[fdi % 10]
    const c = pointAt(along + w / 2)
    along += w + GAP
    const tx = RX * Math.cos(c.t)
    const ty = RY * Math.sin(c.t)
    const len = Math.hypot(tx, ty)
    const flip = arch === 'lower' ? -1 : 1
    return { fdi, x: c.x, y: flip * c.y, w, d, angle: (flip * Math.atan2(ty, tx) * 180) / Math.PI, nx: -ty / len, ny: (flip * tx) / len }
  })
}

function roundedRectPath(w: number, h: number, r: number): string {
  const x = -w / 2
  const y = -h / 2
  return `M${round(x + r)} ${round(y)}H${round(x + w - r)}A${r} ${r} 0 0 1 ${round(x + w)} ${round(y + r)}V${round(y + h - r)}A${r} ${r} 0 0 1 ${round(x + w - r)} ${round(y + h)}H${round(x + r)}A${r} ${r} 0 0 1 ${round(x)} ${round(y + h - r)}V${round(y + r)}A${r} ${r} 0 0 1 ${round(x + r)} ${round(y)}Z`
}

function toothMarkup(t: Placed): string {
  const p = t.fdi % 10
  const radius = round(p <= 2 ? t.w * 0.46 : p === 3 ? t.w * 0.44 : p <= 5 ? Math.min(t.w, t.d) * 0.4 : Math.min(t.w, t.d) * 0.32)
  const inner = INNER[p] ? `<path class="groove" d="${roundedRectPath(...INNER[p])}"/>` : ''
  return (
    `<g class="tooth" data-fdi="${t.fdi}" aria-label="${toothName(t.fdi)}, tooth ${t.fdi}" transform="translate(${round(t.x)} ${round(t.y)}) rotate(${round(t.angle)})">` +
    `<rect class="tooth-ring" x="${-t.w / 2 - 4.5}" y="${-t.d / 2 - 4.5}" width="${t.w + 9}" height="${t.d + 9}" rx="${round(radius + 4.5)}"/>` +
    `<rect x="${-t.w / 2}" y="${-t.d / 2}" width="${t.w}" height="${t.d}" rx="${radius}"/>${inner}</g>`
  )
}

/** One arch as static SVG; tooth-explorer.html carries this exact markup (tests/static-shells.test.ts checks). */
export function archMarkup(arch: Arch): string {
  const teeth = layArch(arch)
  const numbers = teeth
    .map((t) => `<text class="tooth-number" x="${round(t.x + t.nx * (t.d / 2 + 12))}" y="${round(t.y + t.ny * (t.d / 2 + 12))}">${t.fdi}</text>`)
    .join('')
  const viewBox = arch === 'upper' ? '-149 -21 298 230' : '-149 -209 298 230'
  const name = arch === 'upper' ? 'Upper teeth' : 'Lower teeth'
  return `<svg class="${ARCH_CLASS[arch]}" viewBox="${viewBox}" width="298" height="230" role="group" aria-label="${name}"><g aria-hidden="true">${numbers}</g>${teeth.map(toothMarkup).join('')}</svg>`
}

/** The tooth list shown below 600 px, also static in tooth-explorer.html. */
export function toothListMarkup(): string {
  return `<div class="grid gap-6 pb-6">${LIST_GROUPS.map(
    (group) =>
      `<section><h4 class="text-lg font-normal">${group.title}</h4><p class="text-sm text-sage">${group.text}</p><div class="mt-3 grid grid-cols-[repeat(auto-fill,minmax(9.25rem,1fr))] gap-2">${[...ROWS.upper, ...ROWS.lower]
        .filter((fdi) => group.types.includes(toothByFdi(fdi).type))
        .map(
          (fdi) =>
            `<button type="button" class="option flex min-h-12 items-center justify-between gap-2 px-3 py-2 text-left text-sm leading-[1.3]" data-fdi="${fdi}" aria-pressed="false"><span>${toothName(fdi)}</span><span class="font-display text-base text-sage">${fdi}</span></button>`,
        )
        .join('')}</div></section>`,
  ).join('')}</div>`
}

function treatmentRow(service: Service): string {
  const { amount, unit: unitText } = priceParts(service)
  const unit = unitText ? ` <span class="font-text text-sm text-sage">${unitText}</span>` : ''
  return (
    `<li class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 border-b border-line py-3">` +
    `<div class="flex flex-wrap items-baseline gap-x-3"><span class="font-semibold">${service.name}</span>` +
    `<span class="text-sm text-sage">${durationLabel(service)}</span></div>` +
    `<span class="col-start-1 font-display text-lg tabular-nums"><span class="font-text text-sm text-sage">starts at</span> ${amount}${unit}</span>` +
    `<a class="button button--quiet button--small col-start-2 row-span-2 row-start-1" href="${bookingHref(BASE, service.id)}">Book this<span class="sr-only">: ${service.name}</span></a></li>`
  )
}

function detailMarkup(fdi: number): string {
  const services = treatmentsFor(fdi)
    .map(serviceById)
    .filter((s): s is Service => s !== undefined)
  return `
    <div class="grid gap-1 motion-safe:animate-panel-in">
      <p class="flex items-center gap-3 font-display text-[3.25rem] leading-none font-light after:size-2.5 after:rounded-full after:bg-apricot" aria-hidden="true">${fdi}</p>
      <h3 class="mt-2 text-2xl font-light" tabindex="-1" data-tooth-name>${toothName(fdi)}</h3>
      <p class="text-sage">Tooth ${fdi}, ${TYPE_LABEL[toothByFdi(fdi).type]}</p>
      <h4 class="mt-6 border-b border-line-strong pb-2 font-text text-sm font-semibold">Usual treatments</h4>
      <ul>${services.map(treatmentRow).join('')}</ul>
      <p class="mt-4 text-sm text-sage">Not sure which tooth it is? Book a check-up and the dentist will find it with you.</p>
    </div>`
}

export function initToothExplorer(root: HTMLElement): void {
  const chart = root.querySelector<HTMLElement>('[data-chart]')
  const panel = root.querySelector<HTMLElement>('[data-panel]')
  const status = root.querySelector<HTMLElement>('[data-explorer-status]')
  if (!chart || !panel || !status) return
  let selected: number | null = null

  const teeth = [...chart.querySelectorAll<SVGGElement>('.tooth')]
  for (const tooth of teeth) {
    tooth.setAttribute('role', 'button')
    tooth.setAttribute('aria-pressed', 'false')
    tooth.setAttribute('tabindex', '-1')
  }

  const toothEl = (fdi: number) => chart.querySelector<SVGGElement>(`.tooth[data-fdi="${fdi}"]`)
  const archOf = (fdi: number): Arch => toothByFdi(fdi).arch

  const setTabStop = (fdi: number) => {
    for (const tooth of teeth) tooth.setAttribute('tabindex', tooth.dataset.fdi === String(fdi) ? '0' : '-1')
  }

  const setArch = (arch: Arch) => {
    root.dataset.arch = arch
    for (const b of root.querySelectorAll<HTMLButtonElement>('[data-arch-toggle] button')) b.setAttribute('aria-pressed', String(b.dataset.arch === arch))
    const stop = teeth.find((t) => t.getAttribute('tabindex') === '0')
    if (!stop || archOf(Number(stop.dataset.fdi)) !== arch) setTabStop(selected !== null && archOf(selected) === arch ? selected : ROWS[arch][7])
  }

  const select = (fdi: number) => {
    selected = fdi
    for (const el of root.querySelectorAll<Element>('[data-fdi]')) {
      const on = el.getAttribute('data-fdi') === String(fdi)
      el.setAttribute('aria-pressed', String(on))
      el.classList.toggle('is-selected', on)
    }
    setTabStop(fdi)
    if (archOf(fdi) !== root.dataset.arch) setArch(archOf(fdi))
    panel.innerHTML = detailMarkup(fdi)
    status.textContent = `${toothName(fdi)}. ${treatmentsFor(fdi).length} usual treatments.`
  }

  chart.addEventListener('click', (event) => {
    const tooth = (event.target as Element).closest<SVGGElement>('.tooth')
    if (tooth) select(Number(tooth.dataset.fdi))
  })

  chart.addEventListener('keydown', (event) => {
    const tooth = (event.target as Element).closest<SVGGElement>('.tooth')
    if (!tooth) return
    const fdi = Number(tooth.dataset.fdi)
    const arch = archOf(fdi)
    const row = ROWS[arch]
    const index = row.indexOf(fdi)
    let next: number | null = null
    switch (event.key) {
      case 'ArrowRight':
        next = row[Math.min(index + 1, row.length - 1)]
        break
      case 'ArrowLeft':
        next = row[Math.max(index - 1, 0)]
        break
      case 'Home':
        next = row[0]
        break
      case 'End':
        next = row[row.length - 1]
        break
      case 'ArrowUp':
        next = ROWS.upper[index]
        break
      case 'ArrowDown':
        next = ROWS.lower[index]
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        select(fdi)
        return
      default:
        return
    }
    event.preventDefault()
    if (archOf(next) !== arch) setArch(archOf(next))
    setTabStop(next)
    toothEl(next)?.focus()
  })

  root.querySelector('[data-arch-toggle]')?.addEventListener('click', (event) => {
    const option = (event.target as Element).closest<HTMLButtonElement>('button[data-arch]')
    if (option?.dataset.arch === 'upper' || option?.dataset.arch === 'lower') setArch(option.dataset.arch)
  })

  root.querySelector('[data-tooth-list]')?.addEventListener('click', (event) => {
    const pick = (event.target as Element).closest<HTMLButtonElement>('button[data-fdi]')
    if (!pick) return
    select(Number(pick.dataset.fdi))
    panel.querySelector<HTMLElement>('[data-tooth-name]')?.focus()
  })

  setTabStop(11)
}
