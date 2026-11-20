import { peso } from './format.ts'

/** Sample starting prices; the Treatments price list and Home's price card mirror this, and tests keep them equal. */
export type Group = 'preventive' | 'restorative' | 'extractions' | 'braces' | 'cosmetic' | 'replacement'
export type Coverage = 'often-covered' | 'needs-loa' | 'usually-not'

export interface Service {
  id: string
  name: string
  group: Group
  /** Starting price in pesos. */
  from: number
  unit?: string
  /** Length of one appointment. */
  minutes: number
  /** Shown instead of the minutes when a treatment takes more than one visit. */
  visits?: string
  includes: string[]
  coverage: Coverage
  ortho?: true
}

export const GROUPS: { id: Group; label: string }[] = [
  { id: 'preventive', label: 'Preventive' },
  { id: 'restorative', label: 'Restorative' },
  { id: 'extractions', label: 'Extractions' },
  { id: 'braces', label: 'Braces' },
  { id: 'cosmetic', label: 'Cosmetic' },
  { id: 'replacement', label: 'Replacement' },
]

/** The metal-braces package; pages state it in bracesPlan()'s words, and a test reads them. */
export const BRACES = { total: 45_000, down: 9_000, monthly: 1_500, months: 24 } as const

/** "₱9,000 down, then ₱1,500 a month for 24 months". */
export function bracesPlan(): string {
  return `${peso(BRACES.down)} down, then ${peso(BRACES.monthly)} a month for ${BRACES.months} months`
}

export const SERVICES: Service[] = [
  { id: 'checkup', name: 'Check-up and consultation', group: 'preventive', from: 500, minutes: 30, coverage: 'often-covered', includes: ['Full mouth exam, gum check, and a written plan with prices before any treatment.'] },
  { id: 'cleaning', name: 'Cleaning', group: 'preventive', from: 1000, minutes: 45, coverage: 'often-covered', includes: ['Scaling to take off tartar, then polishing of every tooth.'] },
  { id: 'fluoride', name: 'Fluoride for kids', group: 'preventive', from: 600, minutes: 20, coverage: 'needs-loa', includes: ['Fluoride varnish brushed onto a child’s teeth after a check-up or cleaning.'] },
  { id: 'xray', name: 'Dental X-ray', group: 'preventive', from: 400, minutes: 15, coverage: 'needs-loa', includes: ['One close-up X-ray of a single tooth or a small area.'] },
  { id: 'panoramic', name: 'Panoramic X-ray', group: 'preventive', from: 1200, minutes: 15, coverage: 'needs-loa', includes: ['One wide X-ray of all teeth and both jaws, used when planning braces or wisdom tooth removal.'] },
  { id: 'filling', name: 'Tooth-coloured filling', group: 'restorative', from: 1200, unit: 'per surface', minutes: 45, coverage: 'needs-loa', includes: ['A filling matched to your tooth colour.', 'Priced per surface of the tooth that needs it.'] },
  { id: 'root-canal-front', name: 'Root canal, front tooth', group: 'restorative', from: 8000, minutes: 90, visits: '2 to 3 visits', coverage: 'usually-not', includes: ['Cleaning and sealing the inside of an incisor or canine, then a filling.', 'X-rays included.'] },
  { id: 'root-canal-molar', name: 'Root canal, back tooth', group: 'restorative', from: 12000, minutes: 90, visits: '2 to 3 visits', coverage: 'usually-not', includes: ['The same treatment for a premolar or molar, which has more canals to clean.', 'X-rays included.'] },
  { id: 'crown', name: 'Crown', group: 'restorative', from: 10000, unit: 'per tooth', minutes: 60, visits: '2 visits', coverage: 'usually-not', includes: ['A cap over the whole tooth: shaped at the first visit, fitted at the second.'] },
  { id: 'extraction', name: 'Simple extraction', group: 'extractions', from: 1000, minutes: 30, coverage: 'often-covered', includes: ['Removing a tooth that has fully come through the gum, plus aftercare instructions.'] },
  { id: 'wisdom', name: 'Wisdom tooth removal', group: 'extractions', from: 6000, minutes: 60, coverage: 'needs-loa', includes: ['Removing a wisdom tooth, including one that hasn’t fully come through.', 'A panoramic X-ray comes first.'] },
  { id: 'braces-metal', name: 'Metal braces', group: 'braces', from: BRACES.total, unit: 'package', minutes: 60, visits: `Monthly for ${BRACES.months} months`, coverage: 'usually-not', ortho: true, includes: [`${bracesPlan()}.`] },
  { id: 'braces-ceramic', name: 'Ceramic braces', group: 'braces', from: 60000, unit: 'package', minutes: 60, visits: 'Monthly adjustments', coverage: 'usually-not', ortho: true, includes: ['Tooth-coloured brackets that blend in with your teeth.', 'Installments available.'] },
  { id: 'whitening', name: 'In-clinic whitening', group: 'cosmetic', from: 12000, minutes: 90, coverage: 'usually-not', includes: ['One whitening session in the chair.', 'Results vary from person to person.'] },
  { id: 'denture-partial', name: 'Partial denture', group: 'replacement', from: 8000, minutes: 60, visits: 'A few visits', coverage: 'usually-not', includes: ['A removable plate that replaces one or more missing teeth, fitted over a few visits.'] },
  { id: 'denture-full', name: 'Full dentures', group: 'replacement', from: 18000, minutes: 60, visits: 'A few visits', coverage: 'usually-not', includes: ['A complete removable set of teeth, made and fitted over a few visits.'] },
]

/** Home's price card lists these, in this order; tests/pages.test.ts checks it. */
export const COMMON_SERVICES = ['checkup', 'cleaning', 'fluoride', 'filling', 'extraction', 'root-canal-front'] as const

/** A starting price in its two parts: "₱1,200" and "per surface" (empty when the price has no unit). */
export function priceParts(service: Service): { amount: string; unit: string } {
  return { amount: peso(service.from), unit: service.unit ?? '' }
}

/** The starting price with its unit, in one string: "₱1,200 per surface", or "₱500" when there is no unit. */
export function priceWithUnit(service: Service): string {
  const { amount, unit } = priceParts(service)
  return unit ? `${amount} ${unit}` : amount
}

export function serviceById(id: string): Service | undefined {
  return SERVICES.find((s) => s.id === id)
}

/** "30 min", "1 hour", "1.5 hours", or the visits for multi-visit treatments. */
export function durationLabel(service: Service): string {
  if (service.visits) return service.visits
  if (service.minutes < 60) return `${service.minutes} min`
  const hours = service.minutes / 60
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
}

/** The clinic's own HMO paperwork for a treatment, never what insurers cover; empty for an unknown id. */
export function hmoChecklist(id: string): string[] {
  const service = serviceById(id)
  if (!service) return []
  if (service.coverage === 'usually-not') {
    const lines = [
      'Some plans don’t cover this. We check yours with your HMO before any work starts.',
      'If your plan covers it, bring your card and one valid ID, and we’ll request the LOA.',
      'If it doesn’t, pay by GCash, Maya, debit or credit card, or cash.',
    ]
    if (service.id === 'braces-metal') lines.push(`Braces can be paid in installments: ${bracesPlan()}.`)
    else if (service.ortho) lines.push('Braces can be paid in installments.')
    return lines
  }
  return [
    'Bring your HMO card and one valid ID.',
    'We request the letter of authorization (LOA) from your HMO before the procedure. You don’t need to.',
    service.coverage === 'often-covered'
      ? 'Some plans cover this in full. The LOA tells us what yours covers.'
      : 'Some plans cover this and some don’t. The LOA tells us which before any work starts.',
    'If your plan covers only part of it, we tell you the balance first.',
  ]
}

/** The checklist is for visits that use an HMO; a self-pay visit has none (the page says how to pay instead). */
export function checklistFor(id: string, hmo: string): string[] {
  return hmo.trim() ? hmoChecklist(id) : []
}
