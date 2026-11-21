import type { Arch } from '../arch.ts'

/* The 16 kinds of adult tooth as numbers. Crown and root sizes, cervical widths and the cementoenamel junction's curve
   are textbook averages; the shapes (cusp places, heights and slopes, grooves, ridges, lobes) are our own modelling
   choices, tuned by eye against real teeth so each kind reads true from every side.

   Each tooth is built in its own frame: x toward the middle of the mouth (mesial), y toward the biting edge (occlusal),
   z toward the lips and cheeks (facial), with the cementoenamel junction's facial point at y = 0. */

export type Kind = 'incisor' | 'canine' | 'premolar' | 'molar'

/** neck: share of the widest size at the cementoenamel junction; peak: where (0 neck, 1 rim) the crown is widest;
    rim: share left at the rim of the biting surface; fall: how the side curves in above the widest point. */
export type Profile = [neck: number, peak: number, rim: number, fall: number]
/** Position as shares of the biting surface's half-widths: x toward the middle of the mouth, z toward the cheek. */
export type At = [x: number, z: number]
/** A cusp: its tip, height, the slope of its inner (triangular ridge) side, the rounding of its tip, how far its cusp
    ridges stretch along the outline, and the slope of its outer side down to the crown's wall. */
export type Cusp = [name: string, x: number, z: number, height: number, slope: number, round: number, stretch?: number, out?: number]
export type Ridge = [name: string, from: At, to: At, height: number, slope: number, round: number]
export type Groove = [name: string, path: At[], depth: number, width: number]
/** A smooth bump (or, below zero, a hollow) on the crown's side: angle (deg, 0 mesial, 90 facial), its spread, the
    height share, its spread, mm out. */
export type Bump = [theta: number, spread: number, t: number, tSpread: number, amount: number, name?: string]
/** One root of a split tooth: half-widths where it leaves the trunk, how far its tip drifts (mesial, facial), its
    length from the facial cementoenamel junction, its distal curve, its canals and the hollow on its sides. */
export type Root = [name: string, md: number, bl: number, driftX: number, driftZ: number, length: number, curve: number, canals: number, hollow: number]

export interface Spec {
  arch: Arch
  position: number
  kind: Kind
  /** Textbook crown height, root length, and crown width along the arch and cheek to tongue. */
  crownH: number
  rootL: number
  md: number
  bl: number
  /** Share of the cheek-to-tongue width on the facial side of the tooth's axis. */
  facial: number
  mdP: Profile
  fP: Profile
  lP: Profile
  /** Squareness of the cross-section (2 is an ellipse) at the neck, the widest point and the rim; facial, then lingual. */
  nF: [number, number, number]
  nL: [number, number, number]
  /** How far the cementoenamel junction curves toward the biting edge on the mesial and distal sides, and how sharply
      (below 1.5 a crisp V on the proximal sides, as on front teeth; 2 and above a gentle sweep, as on molars). */
  cej: [number, number]
  cejSharp: number
  /** The rim's centre moves this far facially from the neck's; shear skews the outline into a rhomboid. */
  shiftZ: number
  shear: number
  top:
    | { kind: 'edge'; drop: [number, number] }
    | { kind: 'point'; tip: number; slopes: [number, number]; round: number }
    | { kind: 'table' }
  cusps: Cusp[]
  ridges: Ridge[]
  grooves: Groove[]
  pits: [x: number, z: number, depth: number, width: number][]
  fossae: [name: string, x: number, z: number][]
  /** How far the rim of the biting surface rounds over into the side. */
  shoulder: number
  bumps: Bump[]
  /** Enamel on the sides and over the cusps or edge. */
  enamel: [side: number, top: number]
  /** One root (md, bl and drifts unused: it grows from the neck), or several split from a trunk. */
  roots: Root[]
  trunk: number
  /** For split roots: the angles (deg) where neighbouring roots part, in increasing order. Root k grows from the trunk's
      arc between splits k and k + 1, so the roots are listed in that order. */
  splits: number[]
  /** Hollow on the mesial and distal faces of a single root (or a split tooth's trunk). */
  hollow: number
  /** How a single root narrows: its share lost by the middle, and how blunt its tip is (higher is blunter). */
  taper: [number, number]
  /** Share the crown loses cheek to tongue toward its distal side (a lower molar's outline narrows distally). */
  narrow?: number
}

const MR = 'Mesial marginal ridge'
const DR = 'Distal marginal ridge'

export const SPECS: Spec[] = [
  {
    arch: 'upper', position: 1, kind: 'incisor', crownH: 10.5, rootL: 13, md: 8.5, bl: 7, facial: 0.46,
    mdP: [0.78, 0.82, 0.96, 3], fP: [0.9, 0.15, 0.17, 1.55], lP: [0.86, 0.17, 0.14, 0.8], nF: [2.2, 3, 3.6], nL: [2.2, 2.5, 3.6],
    cej: [3.5, 2.5], cejSharp: 1.2, shiftZ: 0.25, shear: 0, top: { kind: 'edge', drop: [0.2, 0.85] }, cusps: [], ridges: [], grooves: [], pits: [], fossae: [],
    shoulder: 0.3,
    bumps: [[270, 28, 0.6, 0.2, -0.9, 'Lingual fossa'], [270, 36, 0.17, 0.09, 0.42, 'Cingulum'], [319, 7, 0.6, 0.3, 0.34], [221, 7, 0.6, 0.3, 0.34], [68, 7, 0.72, 0.22, -0.12], [112, 7, 0.72, 0.22, -0.12]],
    enamel: [1, 2], roots: [['Apex', 0, 0, 0, 0, 13, 0.6, 1, 0]], trunk: 0, splits: [], hollow: 0, taper: [0.32, 0.6],
  },
  {
    arch: 'upper', position: 2, kind: 'incisor', crownH: 9, rootL: 13, md: 6.5, bl: 6, facial: 0.46,
    mdP: [0.77, 0.78, 0.92, 2.6], fP: [0.9, 0.15, 0.18, 1.55], lP: [0.86, 0.18, 0.15, 0.8], nF: [2.1, 2.7, 3.2], nL: [2.1, 2.3, 3.2],
    cej: [3, 2.2], cejSharp: 1.2, shiftZ: 0.2, shear: 0, top: { kind: 'edge', drop: [0.45, 1.4] }, cusps: [], ridges: [], grooves: [], pits: [], fossae: [],
    shoulder: 0.3, bumps: [[270, 28, 0.6, 0.2, -0.8, 'Lingual fossa'], [270, 36, 0.17, 0.09, 0.38, 'Cingulum'], [319, 7, 0.6, 0.3, 0.3], [221, 7, 0.6, 0.3, 0.3]],
    enamel: [0.9, 1.8], roots: [['Apex', 0, 0, 0, 0, 13, 1.3, 1, 0]], trunk: 0, splits: [], hollow: 0.1, taper: [0.36, 0.55],
  },
  {
    arch: 'upper', position: 3, kind: 'canine', crownH: 10, rootL: 17, md: 7.5, bl: 8, facial: 0.48,
    mdP: [0.73, 0.74, 0.93, 2.6], fP: [0.88, 0.2, 0.25, 1.45], lP: [0.86, 0.22, 0.23, 1], nF: [2, 2.1, 2.3], nL: [2.1, 2.2, 2.4],
    cej: [2.5, 1.5], cejSharp: 1.3, shiftZ: 0.2, shear: 0, top: { kind: 'point', tip: 0.35, slopes: [0.68, 0.84], round: 0.15 }, cusps: [], ridges: [], grooves: [], pits: [], fossae: [],
    shoulder: 0.3,
    bumps: [[90, 12, 0.62, 0.32, 0.24], [270, 8, 0.62, 0.3, 0.5], [249, 11, 0.6, 0.2, -0.5], [291, 11, 0.6, 0.2, -0.5], [270, 45, 0.18, 0.1, 0.55, 'Cingulum'], [317, 7, 0.55, 0.3, 0.26], [223, 7, 0.55, 0.3, 0.26]],
    enamel: [1, 2.2], roots: [['Apex', 0, 0, 0, 0, 17, 0.8, 1, 0]], trunk: 0, splits: [], hollow: 0.22, taper: [0.3, 0.6],
  },
  {
    arch: 'upper', position: 4, kind: 'premolar', crownH: 8.5, rootL: 14, md: 7, bl: 9, facial: 0.5,
    mdP: [0.72, 0.72, 0.95, 3], fP: [0.89, 0.26, 0.6, 1.5], lP: [0.89, 0.48, 0.58, 1.5], nF: [2.3, 2.6, 2.6], nL: [2.2, 2.4, 2.4],
    cej: [1.1, 0.6], cejSharp: 1.6, shiftZ: 0, shear: 0, top: { kind: 'table' },
    cusps: [['Buccal cusp', -0.06, 0.82, 8.5, 0.95, 0.2, 1.15, 1.4], ['Palatal cusp', 0.1, -0.8, 7.6, 0.9, 0.28, 1.05, 1.35]],
    ridges: [[MR, [0.86, -0.6], [0.86, 0.66], 6.2, 1.05, 0.3], [DR, [-0.86, -0.6], [-0.86, 0.66], 6.1, 1.05, 0.3]],
    grooves: [['Central groove', [[0.62, 0.02], [0, 0], [-0.62, 0.02]], 0.6, 0.22], ['Mesial marginal groove', [[0.62, 0.02], [1.06, 0.1]], 0.4, 0.17]],
    pits: [[0.62, 0.02, 0.3, 0.3], [-0.62, 0.02, 0.3, 0.3]], fossae: [['Mesial fossa', 0.6, 0], ['Distal fossa', -0.6, 0]],
    shoulder: 0.2, bumps: [[0, 22, 0.3, 0.2, -0.38], [90, 14, 0.62, 0.4, 0.16]], enamel: [1.2, 2.2],
    roots: [['Buccal', 1.45, 1.75, 0, 0.55, 14, 0.6, 1, 0.12], ['Palatal', 1.4, 1.6, 0, -0.7, 13.5, 0.5, 1, 0.1]], trunk: 7.5, splits: [0, 180], hollow: 0.45, taper: [0.3, 0.5],
  },
  {
    arch: 'upper', position: 5, kind: 'premolar', crownH: 8.5, rootL: 14, md: 6.5, bl: 9, facial: 0.5,
    mdP: [0.77, 0.72, 0.95, 3], fP: [0.89, 0.26, 0.6, 1.5], lP: [0.89, 0.48, 0.6, 1.5], nF: [2.3, 2.6, 2.6], nL: [2.2, 2.5, 2.5],
    cej: [1, 0.6], cejSharp: 1.6, shiftZ: 0, shear: 0, top: { kind: 'table' },
    cusps: [['Buccal cusp', 0, 0.82, 8.5, 0.92, 0.22, 1.2, 1.4], ['Palatal cusp', 0, -0.8, 8.1, 0.9, 0.28, 1.15, 1.35]],
    ridges: [[MR, [0.86, -0.6], [0.86, 0.66], 6.4, 1.05, 0.3], [DR, [-0.86, -0.6], [-0.86, 0.66], 6.3, 1.05, 0.3]],
    grooves: [['Central groove', [[0.44, 0], [0, 0.02], [-0.44, 0]], 0.55, 0.21], ['Mesial supplemental groove', [[0.44, 0], [0.66, 0.4]], 0.25, 0.15], ['Distal supplemental groove', [[-0.44, 0], [-0.66, 0.38]], 0.25, 0.15]],
    pits: [[0.48, 0, 0.28, 0.3], [-0.48, 0, 0.28, 0.3]], fossae: [['Mesial fossa', 0.5, 0], ['Distal fossa', -0.5, 0]],
    shoulder: 0.2, bumps: [[90, 14, 0.62, 0.4, 0.12]], enamel: [1.2, 2.2], roots: [['Apex', 0, 0, 0, 0, 14, 0.6, 1, 0]], trunk: 0, splits: [], hollow: 0.5, taper: [0.3, 0.5],
  },
  {
    arch: 'upper', position: 6, kind: 'molar', crownH: 7.5, rootL: 12.8, md: 10, bl: 11, facial: 0.48,
    mdP: [0.86, 0.56, 0.84, 1.7], fP: [0.93, 0.2, 0.66, 1.5], lP: [0.92, 0.42, 0.66, 1.5], nF: [2.6, 3.2, 3], nL: [2.6, 3, 2.8],
    cej: [0.9, 0.5], cejSharp: 2, shiftZ: 0, shear: 0.12, top: { kind: 'table' },
    cusps: [['Mesiobuccal cusp', 0.52, 0.8, 7.4, 0.82, 0.24, 1, 1.35], ['Distobuccal cusp', -0.46, 0.82, 7.1, 0.84, 0.24, 1, 1.35], ['Mesiopalatal cusp', 0.34, -0.74, 7.5, 0.76, 0.38, 1.12, 1.3], ['Distopalatal cusp', -0.58, -0.78, 6.4, 0.88, 0.26, 1, 1.35]],
    ridges: [[MR, [0.88, -0.62], [0.88, 0.66], 5.3, 1, 0.3], [DR, [-0.88, -0.58], [-0.88, 0.66], 5.1, 1, 0.3], ['Oblique ridge', [0.32, -0.6], [-0.44, 0.7], 5.6, 0.9, 0.35]],
    grooves: [['Central groove', [[0.7, 0], [0.4, 0.06], [0.08, 0.12]], 0.62, 0.2], ['Buccal groove', [[0.08, 0.12], [0.03, 0.7], [0.02, 1.1]], 0.6, 0.2], ['Distopalatal groove', [[-0.62, 0.05], [-0.42, -0.3], [-0.14, -0.72], [-0.06, -1.1]], 0.58, 0.2]],
    pits: [[0.08, 0.12, 0.35, 0.34], [-0.6, 0.05, 0.3, 0.32], [0.7, 0, 0.25, 0.3]], fossae: [['Central fossa', 0.08, 0.12], ['Distal fossa', -0.6, 0.05]],
    shoulder: 0.2, bumps: [[292, 15, 0.6, 0.13, 0.85, 'Cusp of Carabelli'], [90, 5, 0.68, 0.25, -0.32], [252, 5, 0.68, 0.22, -0.26]], enamel: [1.3, 2.3],
    roots: [['Distobuccal', 1.85, 2.15, -0.9, 0.6, 11.2, 0.6, 1, 0.05], ['Palatal', 2.45, 2.35, 0, -2.6, 12.8, 0.2, 1, 0.1], ['Mesiobuccal', 2.15, 2.9, 0.8, 0.7, 12, 1.5, 2, 0.3]],
    trunk: 4.2, splits: [90, 205, 335], hollow: 0.25, taper: [0.3, 0.5],
  },
  {
    arch: 'upper', position: 7, kind: 'molar', crownH: 7, rootL: 12, md: 9, bl: 11, facial: 0.48,
    mdP: [0.85, 0.56, 0.82, 1.7], fP: [0.93, 0.2, 0.66, 1.5], lP: [0.92, 0.42, 0.64, 1.5], nF: [2.5, 3.1, 2.9], nL: [2.5, 2.8, 2.6],
    cej: [0.8, 0.5], cejSharp: 2, shiftZ: 0, shear: 0.18, top: { kind: 'table' },
    cusps: [['Mesiobuccal cusp', 0.52, 0.8, 6.8, 0.8, 0.26, 1, 1.3], ['Distobuccal cusp', -0.42, 0.82, 6.4, 0.84, 0.26, 1, 1.3], ['Mesiopalatal cusp', 0.3, -0.72, 7, 0.74, 0.45, 1.15, 1.25], ['Distopalatal cusp', -0.62, -0.78, 5.6, 0.92, 0.28, 1, 1.3]],
    ridges: [[MR, [0.88, -0.62], [0.88, 0.66], 5.4, 1, 0.3], [DR, [-0.88, -0.58], [-0.88, 0.66], 5, 1, 0.3], ['Oblique ridge', [0.28, -0.58], [-0.4, 0.7], 5.4, 0.9, 0.35]],
    grooves: [['Central groove', [[0.7, 0], [0.4, 0.06], [0.08, 0.12]], 0.6, 0.2], ['Buccal groove', [[0.08, 0.12], [0.05, 0.7], [0.03, 1.1]], 0.55, 0.2], ['Distopalatal groove', [[-0.58, 0.05], [-0.4, -0.3], [-0.22, -0.7], [-0.16, -1.1]], 0.55, 0.2]],
    pits: [[0.08, 0.12, 0.35, 0.34], [-0.56, 0.05, 0.3, 0.32]], fossae: [['Central fossa', 0.08, 0.12], ['Distal fossa', -0.56, 0.05]],
    shoulder: 0.2, bumps: [[92, 5, 0.68, 0.25, -0.28], [256, 5, 0.68, 0.22, -0.22]], enamel: [1.3, 2.2],
    roots: [['Distobuccal', 1.55, 1.8, -0.5, 0.5, 10.8, 1.2, 1, 0], ['Palatal', 2, 1.95, 0, -1.8, 12, 0.6, 1, 0.05], ['Mesiobuccal', 1.8, 2.4, 0.6, 0.5, 11.5, 1.8, 1, 0.2]],
    trunk: 4.8, splits: [90, 210, 335], hollow: 0.2, taper: [0.3, 0.5],
  },
  {
    arch: 'upper', position: 8, kind: 'molar', crownH: 6.5, rootL: 11, md: 8.5, bl: 10, facial: 0.48,
    mdP: [0.84, 0.56, 0.82, 1.6], fP: [0.93, 0.22, 0.66, 1.5], lP: [0.92, 0.42, 0.62, 1.5], nF: [2.3, 2.6, 2.4], nL: [2.3, 2.5, 2.3],
    cej: [0.7, 0.4], cejSharp: 2, shiftZ: 0, shear: 0.12, top: { kind: 'table' },
    cusps: [['Mesiobuccal cusp', 0.48, 0.76, 6.5, 0.8, 0.3, 1, 1.3], ['Distobuccal cusp', -0.46, 0.72, 6, 0.84, 0.3, 1, 1.3], ['Mesiopalatal cusp', 0.22, -0.7, 6.3, 0.76, 0.48, 1.15, 1.25], ['Distopalatal cusp', -0.62, -0.72, 5, 1, 0.3, 1, 1.3]],
    ridges: [[MR, [0.86, -0.6], [0.86, 0.66], 5.1, 1, 0.3], [DR, [-0.86, -0.55], [-0.86, 0.6], 4.7, 1, 0.3]],
    grooves: [['Central groove', [[0.64, 0], [0.3, 0.05], [-0.1, 0.02], [-0.62, -0.05]], 0.55, 0.21], ['Buccal groove', [[0, 0.04], [0, 1.1]], 0.48, 0.2], ['Palatal groove', [[-0.2, 0], [-0.26, -1.1]], 0.48, 0.2]],
    pits: [[0, 0.04, 0.32, 0.36]], fossae: [['Central fossa', 0, 0.04]],
    shoulder: 0.2, bumps: [], enamel: [1.2, 2.1],
    roots: [['Distobuccal', 1.6, 1.8, -0.4, 0.2, 10.5, 1.4, 1, 0], ['Palatal', 1.9, 1.9, 0, -0.9, 10.8, 0.8, 1, 0], ['Mesiobuccal', 1.75, 2.1, 0.2, 0.3, 11, 1.6, 1, 0]],
    trunk: 4.8, splits: [90, 210, 335], hollow: 0.2, taper: [0.3, 0.5],
  },
  {
    arch: 'lower', position: 1, kind: 'incisor', crownH: 9, rootL: 12.5, md: 5, bl: 6, facial: 0.45,
    mdP: [0.7, 0.82, 0.94, 2.8], fP: [0.9, 0.13, 0.2, 1.55], lP: [0.88, 0.14, 0.16, 1], nF: [2.2, 2.9, 3.4], nL: [2.2, 2.5, 3.6],
    cej: [3, 2.2], cejSharp: 1.15, shiftZ: -0.35, shear: 0, top: { kind: 'edge', drop: [0.18, 0.3] }, cusps: [], ridges: [], grooves: [], pits: [], fossae: [],
    shoulder: 0.25, bumps: [[270, 30, 0.6, 0.2, -0.32, 'Lingual fossa'], [270, 40, 0.17, 0.1, 0.18, 'Cingulum'], [322, 8, 0.6, 0.3, 0.1], [218, 8, 0.6, 0.3, 0.1]],
    enamel: [0.8, 1.6], roots: [['Apex', 0, 0, 0, 0, 12.5, 0.4, 1, 0]], trunk: 0, splits: [], hollow: 0.5, taper: [0.3, 0.6],
  },
  {
    arch: 'lower', position: 2, kind: 'incisor', crownH: 9.5, rootL: 14, md: 5.5, bl: 6.5, facial: 0.45,
    mdP: [0.73, 0.8, 0.92, 2.6], fP: [0.9, 0.13, 0.2, 1.55], lP: [0.88, 0.14, 0.16, 1], nF: [2.2, 2.9, 3.3], nL: [2.2, 2.5, 3.5],
    cej: [3, 2.2], cejSharp: 1.15, shiftZ: -0.35, shear: 0, top: { kind: 'edge', drop: [0.25, 0.65] }, cusps: [], ridges: [], grooves: [], pits: [], fossae: [],
    shoulder: 0.25, bumps: [[270, 30, 0.6, 0.2, -0.34, 'Lingual fossa'], [270, 40, 0.17, 0.1, 0.18, 'Cingulum'], [322, 8, 0.6, 0.3, 0.1], [218, 8, 0.6, 0.3, 0.1]],
    enamel: [0.8, 1.6], roots: [['Apex', 0, 0, 0, 0, 14, 0.7, 1, 0]], trunk: 0, splits: [], hollow: 0.5, taper: [0.3, 0.6],
  },
  {
    arch: 'lower', position: 3, kind: 'canine', crownH: 11, rootL: 16, md: 7, bl: 7.5, facial: 0.48,
    mdP: [0.79, 0.76, 0.94, 2.6], fP: [0.88, 0.2, 0.24, 1.4], lP: [0.86, 0.22, 0.21, 1], nF: [2, 2.1, 2.3], nL: [2.1, 2.2, 2.4],
    cej: [2.5, 1.2], cejSharp: 1.3, shiftZ: -0.2, shear: 0, top: { kind: 'point', tip: 0.5, slopes: [0.45, 0.78], round: 0.16 }, cusps: [], ridges: [], grooves: [], pits: [], fossae: [],
    shoulder: 0.3, bumps: [[90, 12, 0.62, 0.32, 0.16], [270, 8, 0.62, 0.3, 0.3], [250, 11, 0.6, 0.2, -0.3], [290, 11, 0.6, 0.2, -0.3], [270, 45, 0.18, 0.1, 0.3, 'Cingulum'], [318, 7, 0.55, 0.3, 0.14], [222, 7, 0.55, 0.3, 0.14]],
    enamel: [1, 2.1], roots: [['Apex', 0, 0, 0, 0, 16, 0.8, 1, 0]], trunk: 0, splits: [], hollow: 0.35, taper: [0.3, 0.6],
  },
  {
    arch: 'lower', position: 4, kind: 'premolar', crownH: 8.5, rootL: 14, md: 7, bl: 7.5, facial: 0.52,
    mdP: [0.72, 0.7, 0.93, 2.8], fP: [0.89, 0.3, 0.56, 1.5], lP: [0.87, 0.45, 0.56, 1.5], nF: [2.1, 2.3, 2.3], nL: [2.1, 2.2, 2.2],
    cej: [1, 0.6], cejSharp: 1.6, shiftZ: -0.7, shear: 0, top: { kind: 'table' },
    cusps: [['Buccal cusp', 0, 0.38, 8.5, 1, 0.2, 1.1, 1.5], ['Lingual cusp', 0.16, -0.8, 6.4, 0.95, 0.25, 1, 1.35]],
    ridges: [['Transverse ridge', [0, 0.38], [0.14, -0.7], 6.9, 0.85, 0.32], [MR, [0.84, -0.6], [0.84, 0.5], 6.1, 1, 0.28], [DR, [-0.84, -0.6], [-0.84, 0.5], 6.2, 1, 0.28]],
    grooves: [['Mesiolingual groove', [[0.5, -0.3], [0.58, -0.7], [0.66, -1.08]], 0.45, 0.2]],
    pits: [[0.5, -0.26, 0.45, 0.33], [-0.47, -0.26, 0.45, 0.33]], fossae: [['Mesial fossa', 0.5, -0.26], ['Distal fossa', -0.47, -0.26]],
    shoulder: 0.2, bumps: [[90, 14, 0.62, 0.4, 0.12]], enamel: [1.1, 2.1], roots: [['Apex', 0, 0, 0, 0, 14, 0.5, 1, 0]], trunk: 0, splits: [], hollow: 0.25, taper: [0.32, 0.5],
  },
  {
    arch: 'lower', position: 5, kind: 'premolar', crownH: 8, rootL: 14.5, md: 7, bl: 8, facial: 0.5,
    mdP: [0.72, 0.68, 0.92, 2.6], fP: [0.89, 0.3, 0.6, 1.5], lP: [0.87, 0.45, 0.64, 1.5], nF: [2.2, 2.4, 2.4], nL: [2.2, 2.4, 2.4],
    cej: [0.9, 0.6], cejSharp: 1.6, shiftZ: -0.4, shear: 0, top: { kind: 'table' },
    cusps: [['Buccal cusp', 0, 0.66, 8, 0.9, 0.22, 1.25, 1.4], ['Mesiolingual cusp', 0.44, -0.78, 7.4, 0.88, 0.25, 1, 1.35], ['Distolingual cusp', -0.47, -0.78, 6.9, 0.88, 0.25, 1, 1.35]],
    ridges: [[MR, [0.84, -0.6], [0.84, 0.6], 6.1, 1, 0.28], [DR, [-0.84, -0.6], [-0.84, 0.6], 6, 1, 0.28]],
    grooves: [['Central groove', [[0.56, 0], [0, -0.16], [-0.56, 0]], 0.58, 0.21], ['Lingual groove', [[0, -0.16], [-0.02, -0.7], [-0.03, -1.08]], 0.5, 0.2]],
    pits: [[0, -0.16, 0.34, 0.33], [0.56, 0, 0.24, 0.3], [-0.56, 0, 0.24, 0.3]], fossae: [['Central fossa', 0, -0.16]],
    shoulder: 0.2, bumps: [], enamel: [1.1, 2.1], roots: [['Apex', 0, 0, 0, 0, 14.5, 0.6, 1, 0]], trunk: 0, splits: [], hollow: 0.25, taper: [0.32, 0.5],
  },
  {
    arch: 'lower', position: 6, kind: 'molar', crownH: 7.5, rootL: 14, md: 11, bl: 10.5, facial: 0.49,
    mdP: [0.87, 0.58, 0.85, 1.7], fP: [0.92, 0.2, 0.64, 1.5], lP: [0.92, 0.46, 0.68, 1.6], nF: [2.6, 3.3, 3.1], nL: [2.6, 3.2, 3],
    cej: [0.9, 0.5], cejSharp: 2, shiftZ: -0.5, shear: 0, top: { kind: 'table' },
    cusps: [['Mesiobuccal cusp', 0.6, 0.78, 6.9, 0.8, 0.28, 1, 1.3], ['Distobuccal cusp', -0.05, 0.82, 6.7, 0.82, 0.28, 1, 1.3], ['Distal cusp', -0.72, 0.52, 6.2, 0.86, 0.25, 1, 1.3], ['Mesiolingual cusp', 0.52, -0.8, 7.5, 0.8, 0.28, 1, 1.25], ['Distolingual cusp', -0.4, -0.8, 7.2, 0.82, 0.28, 1, 1.25]],
    ridges: [[MR, [0.88, -0.6], [0.88, 0.55], 5.7, 1, 0.3], [DR, [-0.88, -0.55], [-0.88, 0.35], 5.4, 1, 0.3]],
    grooves: [['Central groove', [[0.7, 0], [0.3, 0.04], [0, -0.04], [-0.36, 0.02], [-0.7, -0.04]], 0.62, 0.2], ['Mesiobuccal groove', [[0.3, 0.04], [0.28, 0.7], [0.26, 1.1]], 0.56, 0.19], ['Distobuccal groove', [[-0.36, 0.02], [-0.44, 0.62], [-0.5, 1.1]], 0.5, 0.18], ['Lingual groove', [[0, -0.04], [0.05, -0.7], [0.07, -1.1]], 0.56, 0.19]],
    pits: [[0, -0.02, 0.35, 0.36], [0.7, 0, 0.25, 0.3], [-0.7, -0.04, 0.25, 0.3]], fossae: [['Central fossa', 0, -0.02]],
    shoulder: 0.2, bumps: [[76, 5, 0.68, 0.22, -0.36], [114, 5, 0.68, 0.22, -0.3], [268, 5, 0.68, 0.22, -0.26]], enamel: [1.3, 2.3],
    roots: [['Distal', 2.05, 3.9, -2.2, 0, 13, 0.6, 1, 0.16], ['Mesial', 2.2, 4.2, 1.7, 0, 14, 1.6, 2, 0.36]], trunk: 3, splits: [90, 270], hollow: 0.25, taper: [0.3, 0.5], narrow: 0.08,
  },
  {
    arch: 'lower', position: 7, kind: 'molar', crownH: 7, rootL: 13, md: 10.5, bl: 10, facial: 0.49,
    mdP: [0.85, 0.58, 0.85, 1.7], fP: [0.92, 0.2, 0.64, 1.5], lP: [0.92, 0.46, 0.68, 1.6], nF: [2.6, 3.3, 3.1], nL: [2.6, 3.2, 3],
    cej: [0.8, 0.5], cejSharp: 2, shiftZ: -0.5, shear: 0, top: { kind: 'table' },
    cusps: [['Mesiobuccal cusp', 0.55, 0.8, 6.6, 0.8, 0.28, 1, 1.3], ['Distobuccal cusp', -0.55, 0.8, 6.4, 0.82, 0.28, 1, 1.3], ['Mesiolingual cusp', 0.55, -0.8, 7, 0.8, 0.28, 1, 1.25], ['Distolingual cusp', -0.55, -0.8, 6.8, 0.82, 0.28, 1, 1.25]],
    ridges: [[MR, [0.88, -0.6], [0.88, 0.55], 5.4, 1, 0.3], [DR, [-0.88, -0.55], [-0.88, 0.5], 5.2, 1, 0.3]],
    grooves: [['Central groove', [[0.7, 0], [0, 0], [-0.7, 0]], 0.6, 0.2], ['Buccal groove', [[0, 0], [0, 0.65], [0, 1.1]], 0.55, 0.19], ['Lingual groove', [[0, 0], [0, -0.65], [0, -1.1]], 0.55, 0.19]],
    pits: [[0, 0, 0.35, 0.36], [0.7, 0, 0.25, 0.3], [-0.7, 0, 0.25, 0.3]], fossae: [['Central fossa', 0, 0]],
    shoulder: 0.2, bumps: [[90, 5, 0.68, 0.22, -0.32], [270, 5, 0.68, 0.22, -0.26]], enamel: [1.3, 2.2],
    roots: [['Distal', 1.95, 3.6, -1.6, 0, 12.3, 1, 1, 0.14], ['Mesial', 2.1, 3.9, 1.2, 0, 13, 1.7, 2, 0.34]], trunk: 3.6, splits: [90, 270], hollow: 0.22, taper: [0.3, 0.5], narrow: 0.06,
  },
  {
    arch: 'lower', position: 8, kind: 'molar', crownH: 7, rootL: 11, md: 10, bl: 9.5, facial: 0.49,
    mdP: [0.84, 0.56, 0.84, 1.6], fP: [0.92, 0.22, 0.66, 1.5], lP: [0.92, 0.46, 0.68, 1.5], nF: [2.4, 2.8, 2.6], nL: [2.4, 2.8, 2.6],
    cej: [0.7, 0.4], cejSharp: 2, shiftZ: -0.4, shear: 0, top: { kind: 'table' },
    cusps: [['Mesiobuccal cusp', 0.52, 0.76, 6.5, 0.82, 0.32, 1, 1.3], ['Distobuccal cusp', -0.42, 0.78, 6.2, 0.84, 0.32, 1, 1.3], ['Mesiolingual cusp', 0.5, -0.76, 6.9, 0.82, 0.32, 1, 1.25], ['Distolingual cusp', -0.48, -0.76, 6.6, 0.84, 0.32, 1, 1.25]],
    ridges: [[MR, [0.86, -0.6], [0.86, 0.55], 5.3, 1, 0.3], [DR, [-0.86, -0.55], [-0.86, 0.5], 5, 1, 0.3]],
    grooves: [['Central groove', [[0.66, 0], [0.2, 0.05], [-0.15, -0.04], [-0.66, 0.02]], 0.55, 0.21], ['Buccal groove', [[0.05, 0.02], [0.08, 1.1]], 0.48, 0.2], ['Lingual groove', [[0, -0.02], [0.02, -1.1]], 0.48, 0.2]],
    pits: [[0.02, 0, 0.34, 0.36]], fossae: [['Central fossa', 0.02, 0]],
    shoulder: 0.2, bumps: [], enamel: [1.2, 2.1],
    roots: [['Distal', 1.95, 3.2, -0.9, 0, 10.5, 2.4, 1, 0.1], ['Mesial', 2, 3.4, 0.1, 0, 11, 2.6, 1, 0.2]], trunk: 4.5, splits: [90, 270], hollow: 0.2, taper: [0.3, 0.5], narrow: 0.08,
  },
]

const SPEC_BY_KEY = new Map(SPECS.map((s) => [`${s.arch}${s.position}`, s]))

export const quadrantArch = (fdi: number): Arch => (Math.floor(fdi / 10) <= 2 ? 'upper' : 'lower')
const positionOf = (fdi: number) => fdi % 10

export function specOf(fdi: number): Spec {
  const spec = SPEC_BY_KEY.get(`${quadrantArch(fdi)}${positionOf(fdi)}`)
  if (!spec) throw new RangeError(`There is no adult tooth numbered ${fdi}.`)
  return spec
}

export const specAt = (arch: Arch, position: number): Spec => SPEC_BY_KEY.get(`${arch}${position}`)!

/** Mirror partners share one shape: "upper6" is the same mesh for 16 and 26. */
export const shapeKey = (fdi: number) => `${quadrantArch(fdi)}${positionOf(fdi)}`

/** The textbook sizes the tooth was built from. */
export function toothSizes(fdi: number): { crownHeight: number; rootLength: number; md: number; bl: number } {
  const s = specOf(fdi)
  return { crownHeight: s.crownH, rootLength: s.rootL, md: s.md, bl: s.bl }
}

export const rootCount = (fdi: number) => specOf(fdi).roots.length
export const canalCount = (fdi: number) => specOf(fdi).roots.reduce((sum, r) => sum + r[7], 0)
