import { toothByFdi } from './teeth.ts'

/* Three ways of numbering the 32 adult teeth. Enamel stores and links every tooth by its FDI number (ISO 3950) and
   only converts for display:
   - FDI: the quadrant (1 upper right, 2 upper left, 3 lower left, 4 lower right), then 1 to 8 from the midline.
   - Universal (ADA): 1 to 16 from the upper right third molar across to the upper left one, then 17 to 32 from the
     lower left third molar across to the lower right one.
   - Palmer: the quadrant as UR, UL, LL or LR, then 1 to 8 from the midline, written in text as "UR6". */

export type NumberingSystem = 'fdi' | 'universal' | 'palmer'

export const NUMBERING_SYSTEMS: readonly NumberingSystem[] = ['fdi', 'universal', 'palmer']

/** The switch's visible labels. */
export const NUMBERING_SHORT: Record<NumberingSystem, string> = { fdi: 'FDI', universal: 'UNI', palmer: 'PAL' }

/** The full names, for screen readers and sentences. */
export const NUMBERING_LABEL: Record<NumberingSystem, string> = { fdi: 'FDI', universal: 'Universal', palmer: 'Palmer' }

export const isNumberingSystem = (value: unknown): value is NumberingSystem => NUMBERING_SYSTEMS.includes(value as NumberingSystem)

const POSITIONS = [1, 2, 3, 4, 5, 6, 7, 8]
/** The FDI number back, or a RangeError for anything but 11 to 18, 21 to 28, 31 to 38 or 41 to 48. */
const adult = (fdi: number) => toothByFdi(fdi).fdi
const quadrant = (fdi: number) => Math.floor(fdi / 10)
const position = (fdi: number) => fdi % 10
const fromMidline = (q: number) => POSITIONS.map((p) => q * 10 + p)
const fromBack = (q: number) => fromMidline(q).reverse()

/** FDI numbers in Universal order: index 0 is Universal 1, the upper right third molar. */
const UNIVERSAL_ORDER: number[] = [...fromBack(1), ...fromMidline(2), ...fromBack(3), ...fromMidline(4)]

const QUADRANT: Record<number, { code: string; words: string }> = {
  1: { code: 'UR', words: 'upper right' },
  2: { code: 'UL', words: 'upper left' },
  3: { code: 'LL', words: 'lower left' },
  4: { code: 'LR', words: 'lower right' },
}
const QUADRANT_BY_CODE: Record<string, number> = Object.fromEntries(Object.entries(QUADRANT).map(([q, { code }]) => [code, Number(q)]))

export function fdiToUniversal(fdi: number): number {
  return UNIVERSAL_ORDER.indexOf(adult(fdi)) + 1
}

export function universalToFdi(universal: number): number {
  if (!Number.isInteger(universal) || universal < 1 || universal > 32) throw new RangeError(`Universal numbers run from 1 to 32, so there is no tooth ${universal}.`)
  return UNIVERSAL_ORDER[universal - 1]
}

/** "UR6" for 16, "LL4" for 34. */
export function fdiToPalmer(fdi: number): string {
  return `${QUADRANT[quadrant(adult(fdi))].code}${position(fdi)}`
}

/** Reads "UR6", "ur 6" or "LL4"; null when the text isn't a Palmer number. */
export function palmerToFdi(text: string): number | null {
  const match = /^([UL][RL])\s*([1-8])$/i.exec(text.trim())
  return match ? QUADRANT_BY_CODE[match[1].toUpperCase()] * 10 + Number(match[2]) : null
}

/** The number as written on its own: "16", "#3" or "UR6". */
export function formatTooth(fdi: number, system: NumberingSystem): string {
  if (system === 'universal') return `#${fdiToUniversal(fdi)}`
  if (system === 'palmer') return fdiToPalmer(fdi)
  return String(adult(fdi))
}

/** The number beside a tooth on the chart: "16", "3", or Palmer's digit alone, "6", since the chart's layout shows the quadrant. */
export function chartNumber(fdi: number, system: NumberingSystem): string {
  if (system === 'universal') return String(fdiToUniversal(fdi))
  if (system === 'palmer') return String(position(adult(fdi)))
  return String(adult(fdi))
}

/** The number as a screen reader should say it: "tooth 16", "tooth number 3" or "upper right 6". */
export function spokenTooth(fdi: number, system: NumberingSystem): string {
  if (system === 'universal') return `tooth number ${fdiToUniversal(fdi)}`
  if (system === 'palmer') return `${QUADRANT[quadrant(adult(fdi))].words} ${position(fdi)}`
  return `tooth ${adult(fdi)}`
}
