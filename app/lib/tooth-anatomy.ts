import { toothByFdi } from './teeth.ts'

/* Short notes on each kind of adult tooth, for the explorer's "About this tooth". Left and right teeth are mirror
   images, so there are 16 entries: eight upper, eight lower. Typical anatomy only: real teeth vary. */

export interface ToothNotes {
  summary: string
  roots: string
  canals: string
  eruption: string
  cusps: string
}

const UPPER: ToothNotes[] = [
  {
    summary: 'The widest front tooth, with a straight edge for biting into food. It shapes the front of the smile more than any other tooth.',
    roots: 'One, cone-shaped and fairly straight',
    canals: 'One',
    eruption: 'About 7 to 8 years',
    cusps: 'None: a straight biting edge, with a small bulge near the gum on the inside',
  },
  {
    summary: 'Smaller and rounder than the central incisor beside it. Its size and shape vary more than any other front tooth.',
    roots: 'One, slim, often bending slightly backward near the tip',
    canals: 'One',
    eruption: 'About 8 to 9 years',
    cusps: 'None: a biting edge with rounded corners',
  },
  {
    summary: 'The corner of the smile, with a single point for gripping and tearing. Its root is the longest in the mouth.',
    roots: 'One, the longest of any tooth',
    canals: 'One',
    eruption: 'About 11 to 12 years',
    cusps: 'One pointed cusp, with a ridge sloping away on each side',
  },
  {
    summary: 'The first of the back teeth, with two cusps for crushing food. It is the only upper tooth that usually has two roots.',
    roots: 'Usually two: one on the cheek side, one on the palate side',
    canals: 'Usually two, one in each root',
    eruption: 'About 10 to 11 years',
    cusps: 'Two: a cheek-side cusp and a slightly shorter palate-side one',
  },
  {
    summary: 'Much like the first premolar, but rounder and more even. Its two cusps are close to the same height.',
    roots: 'One, flattened front to back',
    canals: 'One or two',
    eruption: 'About 10 to 12 years',
    cusps: 'Two of almost equal height, on the cheek side and the palate side',
  },
  {
    summary: 'The largest upper tooth and the main grinder. It comes in around age six, behind the baby teeth, without replacing one.',
    roots: 'Three: two on the cheek side, one on the palate side',
    canals: 'Usually four; the front cheek-side root often has two',
    eruption: 'About 6 to 7 years',
    cusps: 'Four, sometimes with a small extra cusp on the palate side',
  },
  {
    summary: 'A slightly smaller grinder behind the first molar. Its back palate-side cusp is small, so its top looks more heart-shaped.',
    roots: 'Three, closer together than on the first molar',
    canals: 'Usually three',
    eruption: 'About 12 to 13 years',
    cusps: 'Four, the back one on the palate side small',
  },
  {
    summary: 'The last tooth at the back, and the most variable in size and shape. Some people never get it, and many have it removed.',
    roots: 'Usually three, often fused into one cone',
    canals: 'Usually three, but it varies',
    eruption: 'About 17 to 21 years, if at all',
    cusps: 'Usually three or four, small and rounded',
  },
]

const LOWER: ToothNotes[] = [
  {
    summary: 'The smallest tooth in the mouth, narrow with a straight edge. It closes just behind the upper front teeth.',
    roots: 'One, narrow side to side and broad front to back',
    canals: 'Usually one; sometimes two',
    eruption: 'About 6 to 7 years',
    cusps: 'None: a straight biting edge',
  },
  {
    summary: 'A little wider than the central incisor beside it, with an edge that fans out slightly toward the back.',
    roots: 'One, flat and long for its size',
    canals: 'Usually one; sometimes two',
    eruption: 'About 7 to 8 years',
    cusps: 'None: a straight biting edge',
  },
  {
    summary: 'The corner of the lower front teeth, narrower than the upper canine. Its long root anchors it firmly.',
    roots: 'One, long',
    canals: 'Usually one',
    eruption: 'About 9 to 10 years',
    cusps: 'One cusp, less pointed than the upper canine’s',
  },
  {
    summary: 'A small tooth between the front and back teeth, part canine and part molar. Its cheek-side cusp is tall and the tongue side is small.',
    roots: 'One',
    canals: 'Usually one',
    eruption: 'About 10 to 12 years',
    cusps: 'Two: a large cheek-side cusp and a small tongue-side one',
  },
  {
    summary: 'Larger and more like a molar than the first premolar. Its top often shows a Y-shaped groove.',
    roots: 'One, slightly longer than the first premolar’s',
    canals: 'Usually one',
    eruption: 'About 11 to 12 years',
    cusps: 'Two or three: one on the cheek side, one or two on the tongue side',
  },
  {
    summary: 'The biggest lower tooth and one of the first adult teeth to come in. It takes much of the force of chewing.',
    roots: 'Two: one at the front and one at the back',
    canals: 'Usually three, sometimes four; the front root usually has two',
    eruption: 'About 6 to 7 years',
    cusps: 'Five: three on the cheek side, two on the tongue side',
  },
  {
    summary: 'A tidier, slightly smaller version of the first molar. Its grooves cross in a plus shape.',
    roots: 'Two, front and back, closer together than on the first molar',
    canals: 'Usually three',
    eruption: 'About 11 to 13 years',
    cusps: 'Four, two on each side',
  },
  {
    summary: 'The last lower tooth, often short of room. It is the tooth most often stuck under the gum or removed.',
    roots: 'Usually two, often fused and curved backward',
    canals: 'Usually two or three',
    eruption: 'About 17 to 21 years, if at all',
    cusps: 'Four or five, often with extra wrinkles',
  },
]

/** The notes for a tooth by its FDI number; mirror partners share them. RangeError for a number that isn't an adult tooth. */
export function toothNotes(fdi: number): ToothNotes {
  const tooth = toothByFdi(fdi)
  return (tooth.arch === 'upper' ? UPPER : LOWER)[(fdi % 10) - 1]
}

/** Labels for the facts, in the order the panel lists them. */
export const NOTE_FACTS: [keyof Omit<ToothNotes, 'summary'>, string][] = [
  ['roots', 'Roots'],
  ['canals', 'Canals'],
  ['cusps', 'Cusps'],
  ['eruption', 'Comes in'],
]
