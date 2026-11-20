/** The 32 adult teeth in FDI numbering: quadrant (1 upper right, 2 upper left, 3 lower left, 4 lower right) then position from the front. */
export type ToothType = 'incisor' | 'canine' | 'premolar' | 'molar' | 'wisdom'

export interface Tooth {
  fdi: number
  arch: 'upper' | 'lower'
  side: 'left' | 'right'
  type: ToothType
}

const TYPE_AT: ToothType[] = ['incisor', 'incisor', 'canine', 'premolar', 'premolar', 'molar', 'molar', 'wisdom']
const NAME_AT = ['central incisor', 'lateral incisor', 'canine', 'first premolar', 'second premolar', 'first molar', 'second molar', 'wisdom tooth']

export const TEETH: Tooth[] = [1, 2, 3, 4].flatMap((quadrant) =>
  TYPE_AT.map((type, i) => ({
    fdi: quadrant * 10 + i + 1,
    arch: quadrant <= 2 ? ('upper' as const) : ('lower' as const),
    side: quadrant === 1 || quadrant === 4 ? ('right' as const) : ('left' as const),
    type,
  })),
)

/** Service ids usually done on each kind of tooth. Premolars and molars share the back-tooth root canal price. */
const TREATMENTS: Record<ToothType, string[]> = {
  incisor: ['xray', 'filling', 'root-canal-front', 'crown', 'extraction', 'whitening'],
  canine: ['xray', 'filling', 'root-canal-front', 'crown', 'extraction', 'whitening'],
  premolar: ['xray', 'filling', 'root-canal-molar', 'crown', 'extraction', 'denture-partial'],
  molar: ['xray', 'filling', 'root-canal-molar', 'crown', 'extraction', 'denture-partial'],
  wisdom: ['panoramic', 'wisdom'],
}

export function toothByFdi(fdi: number): Tooth {
  const tooth = TEETH.find((t) => t.fdi === fdi)
  if (!tooth) throw new RangeError(`There is no adult tooth numbered ${fdi}.`)
  return tooth
}

export function toothName(fdi: number): string {
  const tooth = toothByFdi(fdi)
  const arch = tooth.arch === 'upper' ? 'Upper' : 'Lower'
  return `${arch} ${tooth.side} ${NAME_AT[(fdi % 10) - 1]}`
}

export function treatmentsFor(fdi: number): string[] {
  return [...TREATMENTS[toothByFdi(fdi).type]]
}
