import { ROWS, type Arch } from './arch.ts'

/* Enamel's 3D teeth, gums and arch as plain numbers, generated here from textbook averages; tooth-view.ts turns them
   into three.js meshes. Nothing is loaded: every surface comes from the parameters below.

   Units are millimetres. Each tooth is built in its own frame: x toward the middle of the mouth (mesial), y toward the
   biting edge (occlusal), z toward the lips and cheeks (facial), with the cementoenamel junction's facial point at
   y = 0. The world frame puts x to the viewer's right (the patient's left), y up and z toward the viewer, with the
   biting plane at y = 0. A tooth on one side is the mirror image of its partner on the other. */

export type Vec3 = [number, number, number]

/** The grid's cell, in mm, on every surface. */
export const CELL = 0.6

export interface MeshData {
  positions: Float32Array
  normals: Float32Array
  /** Per vertex: u around and v along the surface in mm (a grid line every CELL), and w. On a tooth w is the spacing of
      the u lines in cells, below 1 where they crowd toward a pole; on the gum it is the depth below the gum line. */
  grid: Float32Array
  indices: Uint32Array
}

export interface Landmark {
  name: string
  /** Tooth-local point on the surface, and the way the surface faces there. */
  anchor: Vec3
  normal: Vec3
  /** Grooves, ridges, edges and the cementoenamel junction also have a short line along the surface. */
  line?: Vec3[]
}

type Kind = 'incisor' | 'canine' | 'premolar' | 'molar'

/** neck: share of the widest size at the cementoenamel junction; peak: where (0 neck, 1 rim) the crown is widest;
    rim: share left at the rim of the biting surface; fall: how the side curves in above the widest point. */
type Profile = [neck: number, peak: number, rim: number, fall: number]
/** Position as shares of the biting surface's half-widths: x toward the middle of the mouth, z toward the cheek. */
type At = [x: number, z: number]
type Cusp = [name: string, x: number, z: number, height: number, slope: number, round: number, stretch?: number]
type Ridge = [name: string, from: At, to: At, height: number, slope: number, round: number]
type Groove = [name: string, path: At[], depth: number, width: number]
/** A smooth bump on the crown's side: angle (deg, 0 mesial, 90 facial), its spread, the height share, its spread, mm out. */
type Bump = [theta: number, spread: number, t: number, tSpread: number, amount: number, name?: string]
/** One root of a split tooth: half-widths where it leaves the trunk, how far its tip drifts (mesial, facial), its
    length from the facial cementoenamel junction, its distal curve, its canals and the hollow on its sides. */
type Root = [name: string, md: number, bl: number, driftX: number, driftZ: number, length: number, curve: number, canals: number, hollow: number]

interface Spec {
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
  /** How far the cementoenamel junction curves toward the biting edge on the mesial and distal sides. */
  cej: [number, number]
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
  shoulder: number
  bumps: Bump[]
  /** Enamel on the sides and over the cusps or edge. */
  enamel: [side: number, top: number]
  /** One root (md, bl and drifts unused: it grows from the neck), or several split from a trunk. */
  roots: Root[]
  trunk: number
  /** For split roots: the angles (deg) where neighbouring roots part, in increasing order. */
  splits: number[]
  /** Hollow on the mesial and distal faces of a single root. */
  hollow: number
}

const MR = 'Mesial marginal ridge'
const DR = 'Distal marginal ridge'

/* The 16 kinds of adult tooth, upper then lower, front to back. Crown and root sizes are the textbook averages in the
   brief; the shapes (cusp places and heights, grooves, ridges) are modelling choices that keep each kind recognisable. */
const SPECS: Spec[] = [
  {
    arch: 'upper', position: 1, kind: 'incisor', crownH: 10.5, rootL: 13, md: 8.5, bl: 7, facial: 0.46,
    mdP: [0.75, 0.74, 0.88, 2.6], fP: [0.93, 0.16, 0.17, 1.7], lP: [0.9, 0.17, 0.15, 0.85], nF: [2.2, 2.4, 2.9], nL: [2.2, 2.4, 3.4],
    cej: [3.5, 2.5], shiftZ: 0.25, shear: 0, top: { kind: 'edge', drop: [0.45, 0.95] }, cusps: [], ridges: [], grooves: [], pits: [], fossae: [],
    shoulder: 0.35, bumps: [[270, 30, 0.58, 0.2, -0.5, 'Lingual fossa'], [268, 38, 0.2, 0.1, 0.25, 'Cingulum'], [318, 9, 0.6, 0.3, 0.12], [222, 9, 0.6, 0.3, 0.12]],
    enamel: [1, 2], roots: [['Apex', 0, 0, 0, 0, 13, 0.7, 1, 0]], trunk: 0, splits: [], hollow: 0,
  },
  {
    arch: 'upper', position: 2, kind: 'incisor', crownH: 9, rootL: 13, md: 6.5, bl: 6, facial: 0.46,
    mdP: [0.72, 0.7, 0.84, 2.4], fP: [0.93, 0.16, 0.18, 1.7], lP: [0.9, 0.18, 0.16, 0.85], nF: [2.1, 2.3, 2.8], nL: [2.1, 2.3, 3.1],
    cej: [3, 2.2], shiftZ: 0.2, shear: 0, top: { kind: 'edge', drop: [0.7, 1.5] }, cusps: [], ridges: [], grooves: [], pits: [], fossae: [],
    shoulder: 0.35, bumps: [[270, 30, 0.58, 0.2, -0.55, 'Lingual fossa'], [268, 38, 0.2, 0.1, 0.25, 'Cingulum'], [318, 9, 0.6, 0.3, 0.12], [222, 9, 0.6, 0.3, 0.12]],
    enamel: [0.9, 1.8], roots: [['Apex', 0, 0, 0, 0, 13, 1.3, 1, 0]], trunk: 0, splits: [], hollow: 0,
  },
  {
    arch: 'upper', position: 3, kind: 'canine', crownH: 10, rootL: 17, md: 7.5, bl: 8, facial: 0.48,
    mdP: [0.7, 0.62, 0.86, 1.8], fP: [0.92, 0.2, 0.27, 1.5], lP: [0.88, 0.22, 0.24, 1], nF: [2, 1.9, 2.3], nL: [2.1, 2.1, 2.4],
    cej: [2.5, 1.5], shiftZ: 0.2, shear: 0, top: { kind: 'point', tip: 0.35, slopes: [0.45, 0.6], round: 0.7 }, cusps: [], ridges: [], grooves: [], pits: [], fossae: [],
    shoulder: 0.4, bumps: [[270, 9, 0.62, 0.3, 0.3], [250, 12, 0.6, 0.2, -0.3], [290, 12, 0.6, 0.2, -0.3], [270, 45, 0.2, 0.1, 0.35, 'Cingulum']],
    enamel: [1, 2.2], roots: [['Apex', 0, 0, 0, 0, 17, 0.8, 1, 0]], trunk: 0, splits: [], hollow: 0.15,
  },
  {
    arch: 'upper', position: 4, kind: 'premolar', crownH: 8.5, rootL: 14, md: 7, bl: 9, facial: 0.5,
    mdP: [0.74, 0.55, 0.86, 1.9], fP: [0.92, 0.26, 0.72, 1.9], lP: [0.9, 0.5, 0.68, 1.9], nF: [2.2, 2.3, 2.4], nL: [2.2, 2.3, 2.4],
    cej: [1.1, 0.8], shiftZ: 0, shear: 0, top: { kind: 'table' },
    cusps: [['Buccal cusp', -0.06, 0.55, 8.5, 0.84, 0.43, 1.55], ['Palatal cusp', 0.12, -0.5, 7.7, 0.86, 0.47, 1.3]],
    ridges: [[MR, [0.8, -0.55], [0.8, 0.6], 6.6, 0.9, 0.5], [DR, [-0.8, -0.55], [-0.8, 0.6], 6.5, 0.9, 0.5]],
    grooves: [['Central groove', [[0.62, 0.02], [0, 0], [-0.62, 0.02]], 0.58, 0.26], ['Mesial marginal groove', [[0.62, 0.02], [1.02, 0.08]], 0.37, 0.2]],
    pits: [[0.62, 0.02, 0.25, 0.4], [-0.62, 0.02, 0.25, 0.4]], fossae: [['Mesial fossa', 0.6, 0], ['Distal fossa', -0.6, 0]],
    shoulder: 0.55, bumps: [[0, 22, 0.3, 0.2, -0.35]], enamel: [1.2, 2.2],
    roots: [['Buccal', 1.5, 1.8, 0, 0.8, 14, 0.6, 1, 0], ['Palatal', 1.4, 1.6, 0, -1.2, 13.5, 0.5, 1, 0]], trunk: 7.5, splits: [0, 180], hollow: 0.45,
  },
  {
    arch: 'upper', position: 5, kind: 'premolar', crownH: 8.5, rootL: 14, md: 6.5, bl: 9, facial: 0.5,
    mdP: [0.75, 0.55, 0.86, 1.9], fP: [0.92, 0.26, 0.7, 1.9], lP: [0.9, 0.5, 0.68, 1.9], nF: [2.2, 2.3, 2.4], nL: [2.2, 2.3, 2.4],
    cej: [1, 0.7], shiftZ: 0, shear: 0, top: { kind: 'table' },
    cusps: [['Buccal cusp', 0, 0.55, 8.5, 0.84, 0.47, 1.5], ['Palatal cusp', 0, -0.52, 8.2, 0.84, 0.47, 1.4]],
    ridges: [[MR, [0.8, -0.55], [0.8, 0.6], 6.7, 0.9, 0.5], [DR, [-0.8, -0.55], [-0.8, 0.6], 6.6, 0.9, 0.5]],
    grooves: [['Central groove', [[0.45, 0], [0, 0.02], [-0.45, 0]], 0.53, 0.25]],
    pits: [[0.48, 0, 0.22, 0.38], [-0.48, 0, 0.22, 0.38]], fossae: [['Mesial fossa', 0.5, 0], ['Distal fossa', -0.5, 0]],
    shoulder: 0.55, bumps: [], enamel: [1.2, 2.2], roots: [['Apex', 0, 0, 0, 0, 14, 0.6, 1, 0]], trunk: 0, splits: [], hollow: 0.5,
  },
  {
    arch: 'upper', position: 6, kind: 'molar', crownH: 7.5, rootL: 12.5, md: 10, bl: 11, facial: 0.48,
    mdP: [0.83, 0.5, 0.9, 1.8], fP: [0.9, 0.3, 0.78, 1.8], lP: [0.88, 0.45, 0.74, 1.8], nF: [2.5, 2.9, 2.5], nL: [2.5, 2.8, 2.4],
    cej: [0.9, 0.5], shiftZ: 0, shear: 0.1, top: { kind: 'table' },
    cusps: [['Mesiobuccal cusp', 0.48, 0.56, 7, 0.78, 0.5], ['Distobuccal cusp', -0.46, 0.58, 6.8, 0.8, 0.5], ['Mesiopalatal cusp', 0.4, -0.48, 7.5, 0.71, 0.68, 1.15], ['Distopalatal cusp', -0.52, -0.56, 6.4, 0.84, 0.5]],
    ridges: [[MR, [0.84, -0.55], [0.84, 0.6], 6, 0.9, 0.5], [DR, [-0.84, -0.5], [-0.84, 0.6], 5.8, 0.9, 0.5], ['Oblique ridge', [0.35, -0.45], [-0.42, 0.52], 6.1, 0.85, 0.55]],
    grooves: [['Central groove', [[0.66, 0], [0.38, 0.06], [0.1, 0.08]], 0.53, 0.25], ['Buccal groove', [[0.1, 0.08], [0.02, 0.6], [0, 1.05]], 0.53, 0.23], ['Distopalatal groove', [[-0.58, 0.05], [-0.42, -0.25], [-0.12, -0.62], [-0.05, -1.05]], 0.53, 0.25]],
    pits: [[0.1, 0.08, 0.3, 0.45], [-0.55, 0.05, 0.3, 0.45], [0.66, 0, 0.2, 0.35]], fossae: [['Central fossa', 0.1, 0.08], ['Distal fossa', -0.55, 0.05]],
    shoulder: 0.55, bumps: [[292, 15, 0.6, 0.13, 0.85, 'Cusp of Carabelli'], [90, 5, 0.6, 0.25, -0.3]], enamel: [1.3, 2.3],
    roots: [['Mesiobuccal', 1.45, 2.3, 1.3, 1.2, 12, 1.6, 2, 0.3], ['Distobuccal', 1.35, 1.75, -0.7, 1, 11.2, 0.8, 1, 0], ['Palatal', 1.95, 2.05, 0, -3.6, 12.5, 0.3, 1, 0]],
    trunk: 4, splits: [90, 205, 335], hollow: 0.2,
  },
  {
    arch: 'upper', position: 7, kind: 'molar', crownH: 7, rootL: 11.5, md: 9, bl: 11, facial: 0.48,
    mdP: [0.83, 0.5, 0.89, 1.8], fP: [0.9, 0.3, 0.78, 1.8], lP: [0.88, 0.45, 0.72, 1.8], nF: [2.4, 2.8, 2.4], nL: [2.4, 2.6, 2.3],
    cej: [0.8, 0.5], shiftZ: 0, shear: 0.16, top: { kind: 'table' },
    cusps: [['Mesiobuccal cusp', 0.5, 0.56, 6.6, 0.78, 0.5], ['Distobuccal cusp', -0.42, 0.58, 6.3, 0.8, 0.5], ['Mesiopalatal cusp', 0.32, -0.45, 7, 0.71, 0.72, 1.15], ['Distopalatal cusp', -0.58, -0.6, 5.7, 0.86, 0.5]],
    ridges: [[MR, [0.84, -0.55], [0.84, 0.6], 5.6, 0.9, 0.5], [DR, [-0.84, -0.5], [-0.84, 0.6], 5.3, 0.9, 0.5], ['Oblique ridge', [0.3, -0.42], [-0.38, 0.5], 5.6, 0.85, 0.55]],
    grooves: [['Central groove', [[0.66, 0], [0.38, 0.06], [0.1, 0.08]], 0.53, 0.25], ['Buccal groove', [[0.1, 0.08], [0.04, 0.6], [0.02, 1.05]], 0.47, 0.23], ['Distopalatal groove', [[-0.55, 0.05], [-0.4, -0.25], [-0.18, -0.6], [-0.12, -1.05]], 0.47, 0.25]],
    pits: [[0.1, 0.08, 0.3, 0.45], [-0.52, 0.05, 0.28, 0.42]], fossae: [['Central fossa', 0.1, 0.08], ['Distal fossa', -0.52, 0.05]],
    shoulder: 0.55, bumps: [[92, 5, 0.6, 0.25, -0.25]], enamel: [1.3, 2.2],
    roots: [['Mesiobuccal', 1.2, 1.9, 0.8, 0.8, 11.5, 1.8, 1, 0.2], ['Distobuccal', 1.1, 1.5, -0.4, 0.7, 10.8, 1.2, 1, 0], ['Palatal', 1.6, 1.7, 0, -2.6, 11.5, 0.6, 1, 0]],
    trunk: 4.4, splits: [90, 210, 335], hollow: 0.2,
  },
  {
    arch: 'upper', position: 8, kind: 'molar', crownH: 6.5, rootL: 11, md: 8.5, bl: 10, facial: 0.48,
    mdP: [0.84, 0.5, 0.86, 1.7], fP: [0.9, 0.3, 0.76, 1.7], lP: [0.88, 0.45, 0.68, 1.7], nF: [2.3, 2.5, 2.2], nL: [2.3, 2.4, 2.1],
    cej: [0.7, 0.4], shiftZ: 0, shear: 0.12, top: { kind: 'table' },
    cusps: [['Mesiobuccal cusp', 0.45, 0.55, 6.5, 0.78, 0.54], ['Distobuccal cusp', -0.45, 0.5, 6, 0.8, 0.54], ['Mesiopalatal cusp', 0.25, -0.45, 6.3, 0.71, 0.72, 1.15], ['Distopalatal cusp', -0.6, -0.55, 5, 0.97, 0.36]],
    ridges: [[MR, [0.84, -0.5], [0.84, 0.6], 5.2, 0.9, 0.5], [DR, [-0.84, -0.45], [-0.84, 0.55], 4.9, 0.9, 0.5]],
    grooves: [['Central groove', [[0.62, 0], [0.3, 0.05], [-0.1, 0.02], [-0.6, -0.05]], 0.47, 0.25], ['Buccal groove', [[0, 0.04], [0, 1.05]], 0.42, 0.23], ['Palatal groove', [[-0.2, 0], [-0.25, -1.05]], 0.42, 0.23]],
    pits: [[0, 0.04, 0.28, 0.45]], fossae: [['Central fossa', 0, 0.04]],
    shoulder: 0.5, bumps: [], enamel: [1.2, 2.1],
    roots: [['Mesiobuccal', 1.1, 1.5, -0.4, -0.3, 11, 2, 1, 0], ['Distobuccal', 1, 1.3, 0.4, -0.4, 10.5, 1.6, 1, 0], ['Palatal', 1.3, 1.4, 0, 0.6, 10.8, 1, 1, 0]],
    trunk: 7, splits: [90, 210, 335], hollow: 0.2,
  },
  {
    arch: 'lower', position: 1, kind: 'incisor', crownH: 9, rootL: 12.5, md: 5, bl: 6, facial: 0.45,
    mdP: [0.7, 0.8, 0.9, 2.6], fP: [0.93, 0.14, 0.2, 1.6], lP: [0.9, 0.14, 0.17, 1], nF: [2.2, 2.4, 3], nL: [2.2, 2.5, 3.6],
    cej: [3, 3], shiftZ: -0.35, shear: 0, top: { kind: 'edge', drop: [0.3, 0.4] }, cusps: [], ridges: [], grooves: [], pits: [], fossae: [],
    shoulder: 0.3, bumps: [[270, 30, 0.58, 0.2, -0.28, 'Lingual fossa'], [270, 40, 0.18, 0.1, 0.15, 'Cingulum']],
    enamel: [0.8, 1.6], roots: [['Apex', 0, 0, 0, 0, 12.5, 0.4, 1, 0]], trunk: 0, splits: [], hollow: 0.45,
  },
  {
    arch: 'lower', position: 2, kind: 'incisor', crownH: 9.5, rootL: 14, md: 5.5, bl: 6.5, facial: 0.45,
    mdP: [0.7, 0.78, 0.89, 2.6], fP: [0.93, 0.14, 0.2, 1.6], lP: [0.9, 0.14, 0.17, 1], nF: [2.2, 2.4, 3], nL: [2.2, 2.5, 3.5],
    cej: [3, 2.6], shiftZ: -0.35, shear: 0, top: { kind: 'edge', drop: [0.35, 0.7] }, cusps: [], ridges: [], grooves: [], pits: [], fossae: [],
    shoulder: 0.3, bumps: [[270, 30, 0.58, 0.2, -0.3, 'Lingual fossa'], [270, 40, 0.18, 0.1, 0.15, 'Cingulum']],
    enamel: [0.8, 1.6], roots: [['Apex', 0, 0, 0, 0, 14, 0.7, 1, 0]], trunk: 0, splits: [], hollow: 0.45,
  },
  {
    arch: 'lower', position: 3, kind: 'canine', crownH: 11, rootL: 16, md: 7, bl: 7.5, facial: 0.48,
    mdP: [0.72, 0.65, 0.88, 1.8], fP: [0.92, 0.2, 0.25, 1.4], lP: [0.88, 0.22, 0.22, 1], nF: [2, 1.95, 2.3], nL: [2.1, 2.1, 2.4],
    cej: [2.5, 1.8], shiftZ: -0.2, shear: 0, top: { kind: 'point', tip: 0.45, slopes: [0.32, 0.55], round: 0.8 }, cusps: [], ridges: [], grooves: [], pits: [], fossae: [],
    shoulder: 0.4, bumps: [[270, 9, 0.62, 0.3, 0.18], [250, 12, 0.6, 0.2, -0.2], [290, 12, 0.6, 0.2, -0.2], [270, 45, 0.2, 0.1, 0.22, 'Cingulum']],
    enamel: [1, 2.1], roots: [['Apex', 0, 0, 0, 0, 16, 0.8, 1, 0]], trunk: 0, splits: [], hollow: 0.3,
  },
  {
    arch: 'lower', position: 4, kind: 'premolar', crownH: 8.5, rootL: 14, md: 7, bl: 7.5, facial: 0.52,
    mdP: [0.75, 0.56, 0.84, 1.9], fP: [0.92, 0.3, 0.62, 1.8], lP: [0.88, 0.45, 0.6, 1.8], nF: [2.1, 2.2, 2.2], nL: [2.1, 2.2, 2.2],
    cej: [1, 0.8], shiftZ: -0.7, shear: 0, top: { kind: 'table' },
    cusps: [['Buccal cusp', 0, 0.2, 8.5, 0.92, 0.43, 1.35], ['Lingual cusp', 0.18, -0.68, 6.5, 0.92, 0.36]],
    ridges: [['Transverse ridge', [0, 0.2], [0.15, -0.6], 6.9, 0.8, 0.45], [MR, [0.78, -0.5], [0.78, 0.4], 6.2, 0.9, 0.45], [DR, [-0.78, -0.5], [-0.78, 0.4], 6.3, 0.9, 0.45]],
    grooves: [['Mesiolingual groove', [[0.48, -0.25], [0.55, -0.65], [0.62, -1.05]], 0.42, 0.23]],
    pits: [[0.48, -0.22, 0.4, 0.42], [-0.45, -0.22, 0.4, 0.42]], fossae: [['Mesial fossa', 0.48, -0.22], ['Distal fossa', -0.45, -0.22]],
    shoulder: 0.55, bumps: [], enamel: [1.1, 2.1], roots: [['Apex', 0, 0, 0, 0, 14, 0.5, 1, 0]], trunk: 0, splits: [], hollow: 0.25,
  },
  {
    arch: 'lower', position: 5, kind: 'premolar', crownH: 8, rootL: 14.5, md: 7, bl: 8, facial: 0.5,
    mdP: [0.77, 0.55, 0.86, 1.9], fP: [0.92, 0.3, 0.68, 1.8], lP: [0.88, 0.45, 0.7, 1.8], nF: [2.2, 2.3, 2.3], nL: [2.2, 2.3, 2.3],
    cej: [0.9, 0.7], shiftZ: -0.4, shear: 0, top: { kind: 'table' },
    cusps: [['Buccal cusp', 0, 0.42, 8, 0.84, 0.47, 1.45], ['Mesiolingual cusp', 0.42, -0.55, 7.4, 0.86, 0.4], ['Distolingual cusp', -0.45, -0.55, 6.9, 0.86, 0.4]],
    ridges: [[MR, [0.8, -0.5], [0.8, 0.5], 6.1, 0.9, 0.45], [DR, [-0.8, -0.5], [-0.8, 0.5], 6, 0.9, 0.45]],
    grooves: [['Central groove', [[0.55, 0], [0, -0.12], [-0.55, 0]], 0.53, 0.25], ['Lingual groove', [[0, -0.12], [-0.02, -0.6], [-0.03, -1.05]], 0.47, 0.23]],
    pits: [[0, -0.12, 0.3, 0.42], [0.55, 0, 0.2, 0.35], [-0.55, 0, 0.2, 0.35]], fossae: [['Central fossa', 0, -0.12]],
    shoulder: 0.55, bumps: [], enamel: [1.1, 2.1], roots: [['Apex', 0, 0, 0, 0, 14.5, 0.6, 1, 0]], trunk: 0, splits: [], hollow: 0.25,
  },
  {
    arch: 'lower', position: 6, kind: 'molar', crownH: 7.5, rootL: 14, md: 11, bl: 10.5, facial: 0.49,
    mdP: [0.83, 0.5, 0.9, 1.8], fP: [0.89, 0.22, 0.68, 1.7], lP: [0.88, 0.5, 0.74, 1.8], nF: [2.5, 3, 2.6], nL: [2.5, 2.9, 2.6],
    cej: [0.8, 0.5], shiftZ: -0.5, shear: 0, top: { kind: 'table' },
    cusps: [['Mesiobuccal cusp', 0.55, 0.5, 6.9, 0.76, 0.58], ['Distobuccal cusp', -0.05, 0.56, 6.7, 0.78, 0.58], ['Distal cusp', -0.68, 0.32, 6.2, 0.84, 0.43], ['Mesiolingual cusp', 0.48, -0.56, 7.5, 0.81, 0.43], ['Distolingual cusp', -0.36, -0.56, 7.2, 0.84, 0.43]],
    ridges: [[MR, [0.86, -0.5], [0.86, 0.45], 5.9, 0.9, 0.5], [DR, [-0.86, -0.45], [-0.86, 0.3], 5.7, 0.9, 0.5]],
    grooves: [['Central groove', [[0.66, 0], [0.28, 0.04], [0, -0.04], [-0.35, 0.02], [-0.66, -0.04]], 0.53, 0.25], ['Mesiobuccal groove', [[0.28, 0.04], [0.26, 0.6], [0.24, 1.05]], 0.47, 0.21], ['Distobuccal groove', [[-0.35, 0.02], [-0.42, 0.55], [-0.48, 1.05]], 0.42, 0.2], ['Lingual groove', [[0, -0.04], [0.04, -0.6], [0.06, -1.05]], 0.47, 0.21]],
    pits: [[0, -0.02, 0.3, 0.5], [0.66, 0, 0.2, 0.4], [-0.66, -0.04, 0.2, 0.4]], fossae: [['Central fossa', 0, -0.02]],
    shoulder: 0.55, bumps: [[76, 5, 0.62, 0.22, -0.35], [114, 5, 0.62, 0.22, -0.3]], enamel: [1.3, 2.3],
    roots: [['Mesial', 1.45, 4, 0.9, 0, 14, 1.8, 2, 0.4], ['Distal', 1.4, 3.6, -1.6, 0, 13, 0.6, 1, 0.15]], trunk: 3.2, splits: [90, 270], hollow: 0.2,
  },
  {
    arch: 'lower', position: 7, kind: 'molar', crownH: 7, rootL: 13, md: 10.5, bl: 10, facial: 0.49,
    mdP: [0.83, 0.5, 0.9, 1.8], fP: [0.89, 0.22, 0.68, 1.7], lP: [0.88, 0.5, 0.74, 1.8], nF: [2.5, 3, 2.6], nL: [2.5, 2.9, 2.6],
    cej: [0.8, 0.5], shiftZ: -0.5, shear: 0, top: { kind: 'table' },
    cusps: [['Mesiobuccal cusp', 0.5, 0.52, 6.6, 0.78, 0.58], ['Distobuccal cusp', -0.5, 0.52, 6.4, 0.8, 0.58], ['Mesiolingual cusp', 0.5, -0.55, 7, 0.81, 0.47], ['Distolingual cusp', -0.5, -0.55, 6.8, 0.84, 0.47]],
    ridges: [[MR, [0.86, -0.5], [0.86, 0.45], 5.5, 0.9, 0.5], [DR, [-0.86, -0.45], [-0.86, 0.4], 5.3, 0.9, 0.5]],
    grooves: [['Central groove', [[0.66, 0], [0, 0], [-0.66, 0]], 0.53, 0.25], ['Buccal groove', [[0, 0], [0, 0.55], [0, 1.05]], 0.47, 0.21], ['Lingual groove', [[0, 0], [0, -0.55], [0, -1.05]], 0.47, 0.21]],
    pits: [[0, 0, 0.3, 0.5], [0.66, 0, 0.2, 0.4], [-0.66, 0, 0.2, 0.4]], fossae: [['Central fossa', 0, 0]],
    shoulder: 0.55, bumps: [[90, 5, 0.62, 0.22, -0.3]], enamel: [1.3, 2.2],
    roots: [['Mesial', 1.4, 3.7, 0.4, 0, 13, 1.8, 2, 0.35], ['Distal', 1.35, 3.4, -0.8, 0, 12.3, 1, 1, 0.15]], trunk: 3.6, splits: [90, 270], hollow: 0.2,
  },
  {
    arch: 'lower', position: 8, kind: 'molar', crownH: 7, rootL: 11, md: 10, bl: 9.5, facial: 0.49,
    mdP: [0.83, 0.5, 0.88, 1.7], fP: [0.89, 0.24, 0.7, 1.7], lP: [0.88, 0.5, 0.72, 1.7], nF: [2.3, 2.6, 2.3], nL: [2.3, 2.6, 2.3],
    cej: [0.7, 0.4], shiftZ: -0.4, shear: 0, top: { kind: 'table' },
    cusps: [['Mesiobuccal cusp', 0.5, 0.5, 6.5, 0.78, 0.61], ['Distobuccal cusp', -0.38, 0.52, 6.2, 0.8, 0.61], ['Mesiolingual cusp', 0.48, -0.55, 6.9, 0.81, 0.5], ['Distolingual cusp', -0.45, -0.55, 6.6, 0.84, 0.5]],
    ridges: [[MR, [0.84, -0.5], [0.84, 0.45], 5.4, 0.9, 0.5], [DR, [-0.84, -0.45], [-0.84, 0.4], 5.1, 0.9, 0.5]],
    grooves: [['Central groove', [[0.64, 0], [0.2, 0.05], [-0.15, -0.04], [-0.64, 0.02]], 0.47, 0.25], ['Buccal groove', [[0.05, 0.02], [0.08, 1.05]], 0.42, 0.21], ['Lingual groove', [[0, -0.02], [0.02, -1.05]], 0.42, 0.21]],
    pits: [[0.02, 0, 0.3, 0.5]], fossae: [['Central fossa', 0.02, 0]],
    shoulder: 0.5, bumps: [], enamel: [1.2, 2.1],
    roots: [['Mesial', 1.3, 3.2, -0.2, 0, 11, 2.8, 1, 0.2], ['Distal', 1.3, 3, -0.9, 0, 10.5, 2.6, 1, 0.1]], trunk: 6, splits: [90, 270], hollow: 0.2,
  },
]

const SPEC_BY_KEY = new Map(SPECS.map((s) => [`${s.arch}${s.position}`, s]))

const quadrantArch = (fdi: number): Arch => (Math.floor(fdi / 10) <= 2 ? 'upper' : 'lower')
const positionOf = (fdi: number) => fdi % 10

function specOf(fdi: number): Spec {
  const spec = SPEC_BY_KEY.get(`${quadrantArch(fdi)}${positionOf(fdi)}`)
  if (!spec) throw new RangeError(`There is no adult tooth numbered ${fdi}.`)
  return spec
}

/** Mirror partners share one shape: "upper6" is the same mesh for 16 and 26. */
export const shapeKey = (fdi: number) => `${quadrantArch(fdi)}${positionOf(fdi)}`

/** The textbook sizes the tooth was built from. */
export function toothSizes(fdi: number): { crownHeight: number; rootLength: number; md: number; bl: number } {
  const s = specOf(fdi)
  return { crownHeight: s.crownH, rootLength: s.rootL, md: s.md, bl: s.bl }
}

export const rootCount = (fdi: number) => specOf(fdi).roots.length
export const canalCount = (fdi: number) => specOf(fdi).roots.reduce((sum, r) => sum + r[7], 0)

/* ---------- Small maths ---------- */

const DEG = Math.PI / 180
const TAU = Math.PI * 2
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
const bell = (x: number, w: number) => Math.exp(-((x / w) ** 2))
/** An angle folded into (-π, π]. */
const wrapAngle = (a: number) => a - TAU * Math.round(a / TAU)
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2])
const normalize = (a: Vec3): Vec3 => scale(a, 1 / (length(a) || 1))
const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]

/** Distance from (x, z) to a polyline. */
function polylineDistance(x: number, z: number, pts: [number, number][]): number {
  let best = Infinity
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i]
    const [bx, bz] = pts[i + 1]
    const dx = bx - ax
    const dz = bz - az
    const f = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1)
    best = Math.min(best, Math.hypot(x - ax - f * dx, z - az - f * dz))
  }
  return best
}

/* ---------- One tooth's shape ---------- */

/** The width along one axis at a height share t: from the neck up to the widest point, then in toward the rim. */
function profile(t: number, half: number, [neck, peak, rim, fall]: Profile): number {
  if (t <= peak) return half * (neck + (1 - neck) * Math.sin((Math.PI / 2) * (t / peak)))
  return half * (1 - (1 - rim) * ((t - peak) / (1 - peak)) ** fall)
}

/** Radius of a superellipse in direction (c, s), with half-widths a along x and b along z. */
const superRadius = (c: number, s: number, a: number, b: number, n: number) => (Math.abs(c / a) ** n + Math.abs(s / b) ** n) ** (-1 / n)

type Layer = 'shell' | 'dentin'

/** A tooth's shape with its positions in mm, ready to sample. */
class Shape {
  readonly s: Spec
  readonly layer: Layer
  readonly bF: number
  readonly bL: number
  readonly cusps: { name: string; x: number; z: number; h: number; slope: number; round: number; stretch: number }[]
  readonly ridges: { name: string; a: [number, number]; b: [number, number]; h: number; slope: number; round: number }[]
  readonly grooves: { name: string; pts: [number, number][]; depth: number; width: number }[]
  readonly pits: [number, number, number, number][]
  /** The rim's half-widths (mesiodistal, facial, lingual) and centre. */
  readonly rim: { a: number; f: number; l: number; cz: number }

  constructor(spec: Spec, layer: Layer) {
    this.s = spec
    this.layer = layer
    this.bF = spec.bl * spec.facial
    this.bL = spec.bl * (1 - spec.facial)
    const a = profile(1, spec.md / 2, spec.mdP)
    this.rim = { a, f: profile(1, this.bF, spec.fP), l: profile(1, this.bL, spec.lP), cz: spec.shiftZ }
    this.cusps = spec.cusps.map(([name, fx, fz, h, slope, round, stretch = 1]) => ({ name, ...this.at([fx, fz]), h, slope, round, stretch }))
    this.ridges = spec.ridges.map(([name, from, to, h, slope, round]) => {
      const p = this.at(from)
      const q = this.at(to)
      return { name, a: [p.x, p.z] as [number, number], b: [q.x, q.z] as [number, number], h, slope, round }
    })
    this.grooves = spec.grooves.map(([name, path, depth, width]) => ({ name, pts: path.map((f) => { const p = this.at(f); return [p.x, p.z] as [number, number] }), depth, width }))
    this.pits = spec.pits.map(([fx, fz, depth, width]) => { const p = this.at([fx, fz]); return [p.x, p.z, depth, width] })
  }

  /** A biting-surface position, from shares of the rim's half-widths to mm (with the rhomboid skew). */
  at([fx, fz]: At): { x: number; z: number } {
    const z = this.rim.cz + fz * (fz >= 0 ? this.rim.f : this.rim.l)
    return { x: fx * this.rim.a + this.s.shear * z, z }
  }

  /** Where the cementoenamel junction runs: higher on the mesial and distal sides. */
  cejY(theta: number): number {
    const c = Math.cos(theta)
    return this.s.cej[0] * Math.max(c, 0) ** 1.6 + this.s.cej[1] * Math.max(-c, 0) ** 1.6
  }

  enamelSide(t: number): number {
    return 0.18 + (this.s.enamel[0] - 0.18) * smooth(0, 0.45, t)
  }

  /** The crown side's distance from the axis in direction theta at height share t (0 neck, 1 rim). */
  wallRadius(theta: number, t: number): number {
    const s = this.s
    const c = Math.cos(theta)
    const sn = Math.sin(theta)
    const facial = sn >= 0
    const a = profile(t, s.md / 2, s.mdP)
    const b = facial ? profile(t, this.bF, s.fP) : profile(t, this.bL, s.lP)
    const ns = facial ? s.nF : s.nL
    const n = lerp(lerp(ns[0], ns[1], smooth(0, 0.4, t)), ns[2], smooth(0.4, 1, t))
    let r = superRadius(c, sn, a, b, n)
    const soft = this.layer === 'dentin' ? 0.5 : 1
    for (const [deg, spread, bt, bw, amount] of s.bumps) r += soft * amount * bell(wrapAngle(theta - deg * DEG), spread * DEG) * bell(t - bt, bw)
    if (this.layer === 'dentin') r -= Math.min(this.enamelSide(t), 0.42 * r)
    return r
  }

  /** The crown side's point (x, z) before height, with its rhomboid skew fading in from the neck. */
  wallXZ(theta: number, t: number): [number, number] {
    const r = this.wallRadius(theta, t)
    const z = this.s.shiftZ * smooth(0, 1, t) + r * Math.sin(theta)
    return [r * Math.cos(theta) + this.s.shear * smooth(0, 0.6, t) * z, z]
  }

  shoulderDrop(rho: number): number {
    const depth = this.s.shoulder * (this.layer === 'dentin' ? 0.7 : 1)
    return rho <= 0.6 ? 0 : depth * ((rho - 0.6) / 0.4) ** 2
  }

  /** Height of the biting surface at (x, z), before the rounding near its rim. */
  topHeight(x: number, z: number): number {
    const s = this.s
    const dentin = this.layer === 'dentin'
    const lowered = dentin ? s.enamel[1] : 0
    const zr = (z - this.rim.cz) / Math.max(z >= this.rim.cz ? this.rim.f : this.rim.l, 0.3)
    if (s.top.kind === 'edge') {
      const x0 = 0.55 * this.rim.a
      const m = x > x0 ? s.top.drop[0] * ((x - x0) / (this.rim.a - x0)) ** 2.2 : 0
      const d = x < -x0 ? s.top.drop[1] * ((-x - x0) / (this.rim.a - x0)) ** 1.8 : 0
      return s.crownH - m - d - 0.25 * zr * zr - lowered
    }
    if (s.top.kind === 'point') {
      const tip = s.top.tip
      const slope = x > tip ? s.top.slopes[0] : s.top.slopes[1]
      return s.crownH - slope * (Math.sqrt((x - tip) ** 2 + s.top.round ** 2) - s.top.round) - 0.4 * zr * zr - lowered
    }
    // Back teeth: the cusps and ridges are rounded cones blended with a soft maximum, so grooves form where they meet.
    const k = dentin ? 0.85 : 0.26
    let m = -Infinity
    const heights: number[] = []
    for (const c of this.cusps) {
      const dx = (x - c.x) / c.stretch
      const dz = z - c.z
      heights.push(c.h - c.slope * (Math.sqrt(dx * dx + dz * dz + c.round * c.round) - c.round))
    }
    for (const r of this.ridges) {
      const d = polylineDistance(x, z, [r.a, r.b])
      heights.push(r.h - r.slope * (Math.sqrt(d * d + r.round * r.round) - r.round))
    }
    for (const h of heights) m = Math.max(m, h)
    let sum = 0
    for (const h of heights) sum += Math.exp((h - m) / k)
    let height = m + k * Math.log(sum)
    if (dentin) return height - lowered
    let groove = 0
    for (const g of this.grooves) groove = Math.max(groove, g.depth * bell(polylineDistance(x, z, g.pts), g.width))
    for (const [px, pz, depth, width] of this.pits) groove = Math.max(groove, depth * bell(Math.hypot(x - px, z - pz), width))
    height -= groove
    return height
  }

  /** The rim of the biting surface in direction theta. */
  rimPoint(theta: number): Vec3 {
    const [x, z] = this.wallXZ(theta, 1)
    return [x, this.topHeight(x, z) - this.shoulderDrop(1), z]
  }

  /** The middle of the biting surface. */
  centre(): [number, number] {
    return [this.s.shear * this.rim.cz, this.rim.cz]
  }

  private rimCache = new Map<number, number>()

  wallPoint(theta: number, t: number): Vec3 {
    const [x, z] = this.wallXZ(theta, t)
    let rimY = this.rimCache.get(theta)
    if (rimY === undefined) {
      rimY = this.rimPoint(theta)[1]
      this.rimCache.set(theta, rimY)
    }
    return [x, lerp(this.cejY(theta), rimY, t), z]
  }

  /** A point on the biting surface: rho 1 is the rim, 0 the middle. */
  topPoint(theta: number, rho: number, rim?: Vec3): Vec3 {
    const r = rim ?? this.rimPoint(theta)
    const [cx, cz] = this.centre()
    const x = cx + rho * (r[0] - cx)
    const z = cz + rho * (r[2] - cz)
    return [x, this.topHeight(x, z) - this.shoulderDrop(rho), z]
  }

  /** The biting surface above (x, z), for landmarks placed by position. */
  surfaceAt(x: number, z: number): Vec3 {
    const [cx, cz] = this.centre()
    const theta = Math.atan2(z - cz, x - cx)
    const rim = this.wallXZ(theta, 1)
    const rho = clamp(Math.hypot(x - cx, z - cz) / Math.max(Math.hypot(rim[0] - cx, rim[1] - cz), 1e-6), 0, 1)
    return [x, this.topHeight(x, z) - this.shoulderDrop(rho), z]
  }

  /** A ring around the crown's side at a height share, for counting grid lines. */
  ringAt(t: number): Vec3[] {
    return ringByArc(64, (theta) => this.wallXZ(theta, t), (theta) => this.wallPoint(theta, t)).pts
  }

  /** The single root's taper: rounded to a point at the apex. */
  static taper(u: number, k = 0.5): number {
    return (1 - k * u) * Math.sqrt(Math.max(0, 1 - u ** 4))
  }

  /** A point on a single root (or a split tooth's trunk) at depth d below the facial cementoenamel junction. */
  rootPoint(theta: number, d: number, length: number, curve: number, trunk = false): Vec3 {
    const u = clamp(d / length, 0, 1)
    const taper = trunk ? 1 - 0.07 * u : Shape.taper(u)
    let r = this.wallRadius(theta, 0) * taper
    const hollow = this.s.hollow * Math.sin(Math.PI * Math.min(u * 1.6, 1)) * (bell(wrapAngle(theta), 0.4) + bell(wrapAngle(theta - Math.PI), 0.4))
    r = Math.max(r - hollow * taper, r * 0.45)
    if (this.layer === 'dentin' && !trunk) r = Math.max(r - Math.min(0.18, 0.4 * r) * (1 - taper), 0)
    const cx = trunk ? 0 : -curve * u ** 2.2
    return [cx + r * Math.cos(theta), this.cejY(theta) * (1 - smooth(0, 2.5, d)) - d, r * Math.sin(theta)]
  }
}

/* ---------- Meshes from rings ---------- */

interface Part {
  positions: number[]
  grid: number[]
  indices: number[]
}

const newPart = (): Part => ({ positions: [], grid: [], indices: [] })

/** Evenly spaced points around a closed curve, by its length seen from above, starting at theta 0. flat gives a point's
    x and z alone (cheap, for measuring); at gives the full point. */
function ringByArc(count: number, flat: (theta: number) => [number, number], at: (theta: number) => Vec3): { pts: Vec3[]; thetas: number[] } {
  const K = 180
  const lengths = [0]
  let [px, pz] = flat(0)
  for (let k = 1; k <= K; k++) {
    const [x, z] = flat((TAU * k) / K)
    lengths.push(lengths[k - 1] + Math.hypot(x - px, z - pz))
    px = x
    pz = z
  }
  const total = lengths[K]
  const pts: Vec3[] = []
  const thetas: number[] = []
  let j = 1
  for (let i = 0; i < count; i++) {
    const target = (i / count) * total
    while (j < K && lengths[j] < target) j++
    const f = (target - lengths[j - 1]) / (lengths[j] - lengths[j - 1] || 1)
    const theta = i === 0 ? 0 : (TAU * (j - 1 + f)) / K
    thetas.push(theta)
    pts.push(at(theta))
  }
  return { pts, thetas }
}

const flat = (p: Vec3): [number, number] => [p[0], p[2]]
const perimeter = (ring: Vec3[]) => ring.reduce((sum, p, i) => sum + length(sub(ring[(i + 1) % ring.length], p)), 0)
const meanGap = (a: Vec3[], b: Vec3[]) => a.reduce((sum, p, i) => sum + length(sub(b[Math.min(i, b.length - 1)], p)), 0) / a.length

/**
 * Stitches rings (all the same size, each ordered with increasing angle) into a tube, closed by poles at either end.
 * Each ring gets a duplicate of its first vertex for the grid's seam, and each pole one copy per triangle.
 * fractions: each vertex's share of the way around (for u); v0: v at ring vAt; lines: grid lines around.
 */
function lathe(part: Part, rings: Vec3[][], opts: { top?: Vec3; bottom?: Vec3; lines: number; vAt: number; v0: number; fractions?: number[] }): number[] {
  const count = rings[0].length
  const fractions = opts.fractions ?? rings[0].map((_, i) => i / count)
  const gaps = rings.slice(1).map((ring, j) => meanGap(rings[j], ring))
  const vs = [0]
  for (const gap of gaps) vs.push(vs[vs.length - 1] - gap)
  const shift = opts.v0 - vs[opts.vAt]
  const v = vs.map((x) => x + shift)
  const base = part.positions.length / 3
  const uMax = opts.lines * CELL
  for (let j = 0; j < rings.length; j++) {
    const w = perimeter(rings[j]) / (opts.lines * CELL)
    for (let i = 0; i <= count; i++) {
      const p = rings[j][i % count]
      part.positions.push(p[0], p[1], p[2])
      part.grid.push(i === count ? uMax : fractions[i] * uMax, v[j], w)
    }
  }
  const row = count + 1
  for (let j = 0; j < rings.length - 1; j++) {
    for (let i = 0; i < count; i++) {
      const a = base + j * row + i
      const b = a + 1
      const c = a + row
      const d = c + 1
      part.indices.push(a, b, c, b, d, c)
    }
  }
  const pole = (p: Vec3, ring: number, vPole: number, above: boolean) => {
    const start = part.positions.length / 3
    for (let i = 0; i < count; i++) {
      part.positions.push(p[0], p[1], p[2])
      part.grid.push(((fractions[i] + (i + 1 < count ? fractions[i + 1] : 1)) / 2) * uMax, vPole, 0)
    }
    for (let i = 0; i < count; i++) {
      const a = base + ring * row + i
      const b = a + 1
      if (above) part.indices.push(start + i, b, a)
      else part.indices.push(a, b, start + i)
    }
  }
  if (opts.top) pole(opts.top, 0, v[0] + meanGap([opts.top], rings[0]), true)
  if (opts.bottom) pole(opts.bottom, rings.length - 1, v[rings.length - 1] - meanGap([opts.bottom], rings[rings.length - 1]), false)
  return v
}

/** Joins parts into one mesh, with normals averaged across seams (vertices at the same place share a normal). */
function finish(parts: Part[], flip = false): MeshData {
  const positions: number[] = []
  const grid: number[] = []
  const indices: number[] = []
  for (const part of parts) {
    const base = positions.length / 3
    positions.push(...part.positions)
    grid.push(...part.grid)
    for (const i of part.indices) indices.push(i + base)
  }
  if (flip) for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]]
  const count = positions.length / 3
  // Vertices within a micrometre are the same place (seams and poles are exact copies), packed into one number.
  const q = (v: number) => Math.round(v * 1000) + 100000
  const keyOf = (i: number) => (q(positions[3 * i]) * 200001 + q(positions[3 * i + 1])) * 200001 + q(positions[3 * i + 2])
  const groups = new Map<number, number>()
  const group = new Int32Array(count)
  for (let i = 0; i < count; i++) {
    const key = keyOf(i)
    let g = groups.get(key)
    if (g === undefined) {
      g = groups.size
      groups.set(key, g)
    }
    group[i] = g
  }
  const sums = new Float64Array(groups.size * 3)
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]]
    const pa: Vec3 = [positions[3 * a], positions[3 * a + 1], positions[3 * a + 2]]
    const n = cross(sub([positions[3 * b], positions[3 * b + 1], positions[3 * b + 2]], pa), sub([positions[3 * c], positions[3 * c + 1], positions[3 * c + 2]], pa))
    for (const v of [a, b, c]) {
      sums[3 * group[v]] += n[0]
      sums[3 * group[v] + 1] += n[1]
      sums[3 * group[v] + 2] += n[2]
    }
  }
  const normals = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const g = group[i]
    const n = normalize([sums[3 * g], sums[3 * g + 1], sums[3 * g + 2]])
    normals.set(n, 3 * i)
  }
  return { positions: new Float32Array(positions), normals, grid: new Float32Array(grid), indices: new Uint32Array(indices) }
}

/* ---------- Teeth ---------- */

const AROUND: Record<Kind, number> = { incisor: 52, canine: 52, premolar: 52, molar: 56 }
const TOP_RINGS: Record<Kind, number> = { incisor: 6, canine: 7, premolar: 11, molar: 12 }
const WALL_RINGS = 16

interface Built {
  mesh: MeshData
  /** Root axes for the canals: the centre of each root at a depth, and how far down it goes. */
  axes: { name: string; at: (e: number) => Vec3; length: number; bl: number; canals: number }[]
  /** The crown's outer rings (rim to neck) and the neck ring, for the enamel cap. */
  crown: Part
  neck: Vec3[]
  apices: Vec3[]
  /** The split, where the roots part on the buccal side (or mesial, for the upper first premolar). */
  furcation: Vec3 | null
  /** Each split root's centre where it leaves the trunk: the dentin's roots are built round the shell's. */
  centres: Vec3[]
}

/** The crown (biting surface and sides) as rings from the middle of the biting surface down to the neck. */
function crownRings(shape: Shape): { rings: Vec3[][]; thetaRim: number[]; top: Vec3 } {
  const kind = shape.s.kind
  const count = AROUND[kind]
  const rim = ringByArc(count, (theta) => shape.wallXZ(theta, 1), (theta) => shape.rimPoint(theta))
  const rings: Vec3[][] = []
  const topRings = TOP_RINGS[kind]
  for (let k = 1; k <= topRings; k++) {
    const rho = k / topRings
    rings.push(rim.thetas.map((theta, i) => (k === topRings ? rim.pts[i] : shape.topPoint(theta, rho, rim.pts[i]))))
  }
  for (let k = 1; k <= WALL_RINGS; k++) {
    const t = 0.5 + 0.5 * Math.cos((Math.PI * k) / WALL_RINGS)
    rings.push(ringByArc(count, (theta) => shape.wallXZ(theta, t), (theta) => shape.wallPoint(theta, t)).pts)
  }
  const [cx, cz] = shape.centre()
  return { rings, thetaRim: rim.thetas, top: [cx, shape.topHeight(cx, cz), cz] }
}

function buildTooth(spec: Spec, layer: Layer, rootCentres?: Vec3[]): Built {
  const shape = new Shape(spec, layer)
  const dentin = layer === 'dentin'
  const count = AROUND[spec.kind]
  const { rings: crown, top } = crownRings(shape)
  const neckIndex = crown.length - 1
  const lines = Math.round(perimeter(new Shape(spec, 'shell').ringAt(0.45)) / CELL)
  const part = newPart()
  const crownPart = newPart()
  const neck = crown[neckIndex]
  const apices: Vec3[] = []
  const axes: Built['axes'] = []
  let furcation: Vec3 | null = null
  const centres: Vec3[] = []
  const shrink = dentin ? 0.25 : 0

  if (spec.roots.length === 1) {
    const [name, , , , , length, curve, canals] = spec.roots[0]
    const L = length - shrink
    const rings = [...crown]
    // Both layers sample the same depths, so the dentin's rings stay inside the shell's between them.
    const steps = Math.max(10, Math.round(length / 0.95))
    for (let k = 1; k < steps; k++) {
      const d = length * (1 - (1 - k / steps) ** 1.25)
      if (d > L - 0.2) break
      rings.push(ringByArc(count, (theta) => flat(shape.rootPoint(theta, d, L, curve)), (theta) => shape.rootPoint(theta, d, L, curve)).pts)
    }
    const apex: Vec3 = [-curve, -L, 0]
    apices.push(apex)
    lathe(part, rings, { top, bottom: apex, lines, vAt: neckIndex, v0: 0 })
    lathe(crownPart, crown, { top, lines, vAt: neckIndex, v0: 0 })
    const neckR = Math.min(shape.wallRadius(0, 0), shape.wallRadius(Math.PI / 2, 0), shape.wallRadius(-Math.PI / 2, 0))
    axes.push({ name, at: (e) => [-curve * clamp(e / length, 0, 1) ** 2.2, -e, 0], length, bl: neckR, canals })
    return { mesh: finish([part]), axes, crown: crownPart, neck, apices, furcation, centres: [] }
  }

  // A split tooth: the crown and a short trunk, then one tube per root, joined along bridges across the furcation.
  const trunkRings = 4
  const rings = [...crown]
  // The dentin's split sits a little higher than the shell's, so its furcation stays inside the tooth.
  const lift = dentin ? 0.7 : 0
  for (let k = 1; k <= trunkRings; k++) {
    const at = (theta: number) => shape.rootPoint(theta, ((spec.trunk - lift) * k) / trunkRings, spec.trunk * 4, 0, true)
    rings.push(ringByArc(count, (theta) => flat(at(theta)), at).pts)
  }
  const v = lathe(part, rings, { top, lines, vAt: neckIndex, v0: 0 })
  lathe(crownPart, crown, { top, lines, vAt: neckIndex, v0: 0 })
  const bottom = rings[rings.length - 1]
  const vBottom = v[v.length - 1]
  const yF = bottom.reduce((sum, p) => sum + p[1], 0) / count
  const angles = bottom.map((p) => Math.atan2(p[2], p[0]))
  const nearest = (deg: number) => {
    let best = 0
    for (let i = 1; i < count; i++) if (Math.abs(wrapAngle(angles[i] - deg * DEG)) < Math.abs(wrapAngle(angles[best] - deg * DEG))) best = i
    return best
  }
  const splitAt = spec.splits.map(nearest)
  const dome = dentin ? 0.9 : 0.45
  const middle: Vec3 = [bottom.reduce((s2, p) => s2 + p[0], 0) / count, yF + dome, bottom.reduce((s2, p) => s2 + p[2], 0) / count]
  // Two roots share one bridge; three meet in the middle.
  const bridges = splitAt.map((index) => {
    const from = bottom[index]
    const span = Math.hypot(middle[0] - from[0], middle[2] - from[2])
    const steps = Math.max(2, Math.round(span / 0.8))
    const pts: Vec3[] = []
    for (let k = 1; k < steps; k++) {
      const f = k / steps
      pts.push([lerp(from[0], middle[0], f), yF + dome * Math.sin((Math.PI / 2) * f), lerp(from[2], middle[2], f)])
    }
    return pts
  })
  spec.roots.forEach(([name, md, bl, driftX, driftZ, length, curve, canals, hollow], k) => {
    const start = splitAt[k]
    const end = splitAt[(k + 1) % splitAt.length]
    const top: Vec3[] = []
    for (let i = start; ; i = (i + 1) % count) {
      top.push(bottom[i])
      if (i === end) break
    }
    top.push(...bridges[(k + 1) % splitAt.length], middle, ...[...bridges[k]].reverse())
    const own: Vec3 = [top.reduce((s2, p) => s2 + p[0], 0) / top.length, yF, top.reduce((s2, p) => s2 + p[2], 0) / top.length]
    const c: Vec3 = rootCentres ? [rootCentres[k][0], yF, rootCentres[k][2]] : own
    centres.push(c)
    const phis = top.map((p) => Math.atan2(p[2] - c[2], p[0] - c[0]))
    const extent = length - spec.trunk
    const L = extent + lift - shrink
    // Measured from this layer's split; the shell's and the dentin's axes meet at the same heights.
    const axis = (e: number): Vec3 => {
      const u = clamp((e - lift) / extent, 0, 1)
      return [c[0] + driftX * u - curve * u ** 2.2, yF - e, c[2] + driftZ * u]
    }
    const steps = Math.max(8, Math.round(extent / 0.95))
    const tube: Vec3[][] = [top]
    for (let j = 1; j < steps; j++) {
      const e = lift + extent * (1 - (1 - j / steps) ** 1.25)
      if (e > L - 0.2) break
      const u = e / L
      const taper = Shape.taper(u, 0.4)
      const centre = axis(e)
      const blend = smooth(0, 0.4 * extent, e - lift)
      const half = dentin ? 0.18 : 0
      tube.push(
        top.map((p, i) => {
          const phi = phis[i]
          const hollowed = 1 - hollow * bell(wrapAngle(phi), 0.45) - hollow * bell(wrapAngle(phi - Math.PI), 0.45)
          const r = Math.max(superRadius(Math.cos(phi), Math.sin(phi), Math.max(md - half, 0.2), Math.max(bl - half, 0.2), 2.2) * taper * hollowed, 0.01)
          const target: Vec3 = [centre[0] + r * Math.cos(phi), centre[1], centre[2] + r * Math.sin(phi)]
          // The dentin's outline also shrinks toward the root's middle, keeping it off the shell's furcal faces.
          const shrinkTo = dentin ? 1 - 0.16 * smooth(0, 0.5, e - lift) : 1
          const carried: Vec3 = [centre[0] + (p[0] - c[0]) * shrinkTo, p[1] - e, centre[2] + (p[2] - c[2]) * shrinkTo]
          return mix(carried, target, blend)
        }),
      )
    }
    const apex = axis(L)
    apices.push(apex)
    const arcs = [0]
    for (let i = 1; i <= top.length; i++) arcs.push(arcs[i - 1] + length3(top[i % top.length], top[i - 1]))
    const total = arcs[top.length]
    const tubeLines = Math.max(8, Math.round(perimeter(tube[Math.floor(tube.length / 2)]) / CELL))
    lathe(part, tube, { bottom: apex, lines: tubeLines, vAt: 0, v0: vBottom, fractions: top.map((_, i) => arcs[i] / total) })
    axes.push({ name, at: axis, length: L, bl: Math.min(md, bl), canals })
  })
  // The furcation's entrance on the cheek side, or on the mesial side where the roots split cheek and palate.
  furcation = bottom[splitAt[Math.max(spec.splits.indexOf(90), 0)]]
  return { mesh: finish([part]), axes, crown: crownPart, neck, apices, furcation, centres }
}

const length3 = (a: Vec3, b: Vec3) => length(sub(a, b))

const shells = new Map<string, Built>()
function shellOf(fdi: number): Built {
  const key = shapeKey(fdi)
  let built = shells.get(key)
  if (!built) {
    built = buildTooth(specOf(fdi), 'shell')
    shells.set(key, built)
  }
  return built
}

/** The tooth's outer surface, crown and roots as one closed mesh in its own frame. Mirror partners share it. */
export function toothShell(fdi: number): MeshData {
  return shellOf(fdi).mesh
}

/** Root tips, for checks. */
export function toothApices(fdi: number): Vec3[] {
  return shellOf(fdi).apices
}

export interface ToothLayers {
  /** The enamel cap: the crown's outer surface and the dentin under it, closed at the neck. */
  enamel: MeshData
  /** Dentin, crown and roots, inside the enamel and cementum. */
  dentin: MeshData
  /** The pulp chamber, with a horn under each cusp, and one tapered canal per expected canal. */
  pulp: MeshData
  canals: number
}

const layers = new Map<string, ToothLayers>()

/** The inside layers, built the first time a tooth is opened up, then kept. */
export function toothLayers(fdi: number): ToothLayers {
  const key = shapeKey(fdi)
  const cached = layers.get(key)
  if (cached) return cached
  const spec = specOf(fdi)
  const shell = shellOf(fdi)
  const dentin = buildTooth(spec, 'dentin', shell.centres)
  // The enamel cap: the shell's crown, the dentin's crown turned inside out, and a thin band joining them at the neck.
  const inner = dentin.crown
  const flipped: Part = { positions: inner.positions, grid: inner.grid, indices: [] }
  for (let i = 0; i < inner.indices.length; i += 3) flipped.indices.push(inner.indices[i], inner.indices[i + 2], inner.indices[i + 1])
  const band = newPart()
  const lines = Math.round(perimeter(shell.neck) / CELL)
  lathe(band, [shell.neck, dentin.neck], { lines, vAt: 0, v0: 0 })
  const enamel = finish([shell.crown, flipped, band])
  const { mesh: pulp, canals } = buildPulp(spec, shell)
  const result = { enamel, dentin: dentin.mesh, pulp, canals }
  layers.set(key, result)
  return result
}

/** The pulp chamber follows the crown's shape, smaller, with horns reaching toward the cusps; canals run down each root. */
function buildPulp(spec: Spec, shell: Built): { mesh: MeshData; canals: number } {
  const shape = new Shape(spec, 'shell')
  const parts: Part[] = []
  const multi = spec.roots.length > 1
  const front = spec.kind === 'incisor' || spec.kind === 'canine'
  const [pa, pb] = front ? [0.34, 0.24] : spec.kind === 'premolar' ? [0.3, 0.34] : [0.4, 0.38]
  const bottomY = multi ? -spec.trunk + 2.5 : front ? -2.2 : -2.6
  const roofY = front ? spec.crownH * 0.42 : spec.kind === 'premolar' ? 2.2 : 1.4
  // Horns: under each cusp (scaled toward the middle), under the corners of an incisor's edge, or under a canine's tip.
  const horns: { x: number; z: number; h: number }[] = []
  if (spec.top.kind === 'edge') {
    const a = shape.rim.a * 0.5
    horns.push({ x: a, z: 0, h: spec.crownH - 3.9 }, { x: -a, z: 0, h: spec.crownH - 4.1 })
  } else if (spec.top.kind === 'point') horns.push({ x: spec.top.tip * 0.5, z: 0, h: spec.crownH - 4.3 })
  else for (const c of shape.cusps) horns.push({ x: c.x * 0.55, z: c.z * 0.5, h: c.h - (spec.kind === 'premolar' ? 4.2 : 4) })
  const roof = (x: number, z: number) => {
    const heights = [roofY + 0.3, ...horns.map((hn) => hn.h - 1.5 * (Math.sqrt((x - hn.x) ** 2 + (z - hn.z) ** 2 + 0.09) - 0.3))]
    const m = Math.max(...heights)
    return m + 0.3 * Math.log(heights.reduce((sum, h) => sum + Math.exp((h - m) / 0.3), 0))
  }
  const count = 36
  const half = (theta: number, y: number) => {
    const k = lerp(1, 0.72, clamp((y - bottomY) / (roofY - bottomY), 0, 1))
    const a = (spec.md / 2) * spec.mdP[0] * pa * k
    const b = (Math.sin(theta) >= 0 ? spec.bl * spec.facial : spec.bl * (1 - spec.facial)) * pb * k
    return superRadius(Math.cos(theta), Math.sin(theta), a, b, 2.4)
  }
  const rings: Vec3[][] = []
  const wallTop = (theta: number) => {
    const r = half(theta, roofY)
    return roof(r * Math.cos(theta), r * Math.sin(theta)) - 0.25
  }
  const thetas = Array.from({ length: count }, (_, i) => (TAU * i) / count)
  const roofRings = 7
  for (let k = 1; k <= roofRings; k++) {
    const rho = k / roofRings
    rings.push(
      thetas.map((theta) => {
        const r = half(theta, roofY) * rho
        const x = r * Math.cos(theta)
        const z = r * Math.sin(theta)
        return [x, roof(x, z) - 0.25 * smooth(0.5, 1, rho), z]
      }),
    )
  }
  const wallSteps = 8
  for (let k = 1; k <= wallSteps; k++) {
    const f = k / wallSteps
    rings.push(
      thetas.map((theta) => {
        const y = lerp(wallTop(theta), bottomY, f)
        const r = half(theta, y) * (1 - 0.35 * smooth(0.7, 1, f))
        return [r * Math.cos(theta), y, r * Math.sin(theta)]
      }),
    )
  }
  const chamber = newPart()
  lathe(chamber, rings, { top: [0, roof(0, 0), 0], bottom: [0, bottomY - 0.5, 0], lines: 24, vAt: 0, v0: 0 })
  parts.push(chamber)

  // Canals: from inside the chamber's floor down each root's middle to an opening just short of the apex.
  let canals = 0
  for (const axis of shell.axes) {
    for (let c = 0; c < axis.canals; c++) {
      const spread = axis.canals === 2 ? (c === 0 ? 1 : -1) * 0.3 * axis.bl : 0
      const r0 = (front ? 0.55 : 0.42) * (c === 1 ? 0.8 : 1)
      const steps = 22
      const centres: Vec3[] = []
      const startY = bottomY + 0.5
      const top = axis.at(0)
      const orifice: Vec3 = [top[0] * 0.55, startY, top[2] * 0.55 + spread * 0.6]
      const run = axis.length - 1.2
      for (let k = 0; k <= steps; k++) {
        const f = k / steps
        if (f < 0.12 && multi) {
          const g = f / 0.12
          const along = axis.at(0)
          centres.push([lerp(orifice[0], along[0], g), lerp(orifice[1], along[1], g), lerp(orifice[2], along[2] + spread, g)])
        } else {
          const e = multi ? ((f - 0.12) / 0.88) * run : lerp(-startY, run, f)
          const p = axis.at(Math.max(e, 0))
          const y = multi ? p[1] : Math.min(p[1], startY)
          const u = clamp(e / axis.length, 0, 1)
          centres.push([p[0], y, p[2] + spread * (1 - 0.8 * u)])
        }
      }
      const tube: Vec3[][] = []
      for (let k = 0; k <= steps; k++) {
        const p = centres[k]
        const q = centres[Math.min(k + 1, steps)]
        const o = centres[Math.max(k - 1, 0)]
        const dir = normalize(sub(q, o))
        const side = normalize(cross(dir, [0, 0, 1]))
        const other = normalize(cross(side, dir))
        const r = r0 * (1 - 0.68 * (k / steps)) + 0.06
        tube.push(Array.from({ length: 10 }, (_, i) => {
          const a = (TAU * i) / 10
          return add(p, add(scale(side, r * Math.cos(a)), scale(other, r * Math.sin(a))))
        }))
      }
      const canal = newPart()
      const first = centres[0]
      const last = centres[steps]
      const dirEnd = normalize(sub(last, centres[steps - 1]))
      const dirStart = normalize(sub(centres[1], first))
      lathe(canal, tube, { top: sub(first, scale(dirStart, r0 * 0.8)), bottom: add(last, scale(dirEnd, 0.05)), lines: 8, vAt: 0, v0: 0 })
      parts.push(canal)
      canals++
    }
  }
  return { mesh: finish(parts), canals }
}

/* ---------- Landmarks ---------- */

const landmarkCache = new Map<string, Landmark[]>()

/** Named points (and lines for grooves, ridges and edges) on a tooth's surface, in its own frame. */
export function toothLandmarks(fdi: number): Landmark[] {
  const key = shapeKey(fdi)
  const cached = landmarkCache.get(key)
  if (cached) return cached
  const spec = specOf(fdi)
  const shape = new Shape(spec, 'shell')
  const shell = shellOf(fdi)
  const marks: Landmark[] = []
  const lift = (p: Vec3, n: Vec3) => add(p, scale(n, 0.05))
  const topNormal = (x: number, z: number): Vec3 => {
    const e = 0.08
    const dx = shape.surfaceAt(x + e, z)[1] - shape.surfaceAt(x - e, z)[1]
    const dz = shape.surfaceAt(x, z + e)[1] - shape.surfaceAt(x, z - e)[1]
    return normalize([-dx / (2 * e), 1, -dz / (2 * e)])
  }
  const wallNormal = (theta: number, t: number): Vec3 => {
    const e = 0.01
    const dT = sub(shape.wallPoint(theta + e, t), shape.wallPoint(theta - e, t))
    const dt = sub(shape.wallPoint(theta, Math.min(t + e, 1)), shape.wallPoint(theta, Math.max(t - e, 0)))
    return normalize(cross(dt, dT))
  }
  const onTop = (name: string, x: number, z: number) => {
    const p = shape.surfaceAt(x, z)
    marks.push({ name, anchor: p, normal: topNormal(x, z) })
  }
  const topLine = (name: string, pts: [number, number][]) => {
    const line: Vec3[] = []
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i]
      const [bx, bz] = pts[i + 1]
      const steps = Math.max(2, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.3))
      for (let k = i === 0 ? 0 : 1; k <= steps; k++) {
        const x = lerp(ax, bx, k / steps)
        const z = lerp(az, bz, k / steps)
        line.push(lift(shape.surfaceAt(x, z), topNormal(x, z)))
      }
    }
    const mid = line[Math.floor(line.length / 2)]
    const [mx, , mz] = mid
    marks.push({ name, anchor: shape.surfaceAt(mx, mz), normal: topNormal(mx, mz), line })
  }
  const onWall = (name: string, deg: number, t: number) => marks.push({ name, anchor: shape.wallPoint(deg * DEG, t), normal: wallNormal(deg * DEG, t) })
  const wallLine = (name: string, deg: number, from: number, to: number) => {
    const line: Vec3[] = []
    for (let k = 0; k <= 12; k++) {
      const t = lerp(from, to, k / 12)
      line.push(lift(shape.wallPoint(deg * DEG, t), wallNormal(deg * DEG, t)))
    }
    const t = (from + to) / 2
    marks.push({ name, anchor: shape.wallPoint(deg * DEG, t), normal: wallNormal(deg * DEG, t), line })
  }
  const palatal = spec.arch === 'upper'
  if (spec.top.kind === 'edge') {
    const a = shape.rim.a * 0.92
    topLine('Incisal edge', [[-a, shape.rim.cz], [a, shape.rim.cz]])
    wallLine(MR, 312, 0.32, 0.9)
    wallLine(DR, 228, 0.32, 0.9)
  } else if (spec.top.kind === 'point') {
    const tip = spec.top.tip
    onTop('Cusp tip', tip, shape.rim.cz)
    topLine('Mesial cusp ridge', [[tip + 0.3, shape.rim.cz], [shape.rim.a * 0.92, shape.rim.cz]])
    topLine('Distal cusp ridge', [[tip - 0.3, shape.rim.cz], [-shape.rim.a * 0.92, shape.rim.cz]])
    wallLine('Lingual ridge', 270, 0.38, 0.95)
  } else {
    for (const c of shape.cusps) onTop(c.name, c.x, c.z)
    for (const r of shape.ridges) topLine(r.name, [r.a, r.b])
    for (const g of shape.grooves) topLine(g.name, g.pts.map(([x, z]) => {
      // Keep groove lines on the biting surface, inside its rim.
      const [cx, cz] = shape.centre()
      const theta = Math.atan2(z - cz, x - cx)
      const [rx, rz] = shape.wallXZ(theta, 1)
      const limit = 0.88 * Math.hypot(rx - cx, rz - cz)
      const d = Math.hypot(x - cx, z - cz)
      return d > limit ? [cx + ((x - cx) * limit) / d, cz + ((z - cz) * limit) / d] : [x, z]
    }))
    for (const [name, fx, fz] of spec.fossae) {
      const p = shape.at([fx, fz])
      onTop(name, p.x, p.z)
    }
  }
  for (const [deg, , t, , , name] of spec.bumps) if (name) onWall(palatal && name === 'Lingual fossa' ? 'Palatal fossa' : name, deg, t)
  const cejLine: Vec3[] = []
  for (let k = 0; k <= 48; k++) cejLine.push(lift(shape.wallPoint((TAU * k) / 48, 0), wallNormal((TAU * k) / 48, 0)))
  marks.push({ name: 'Cementoenamel junction', anchor: shape.wallPoint(Math.PI / 2, 0), normal: wallNormal(Math.PI / 2, 0), line: cejLine })
  if (shell.furcation) marks.push({ name: 'Furcation', anchor: shell.furcation, normal: normalize([shell.furcation[0], 0, shell.furcation[2]]) })
  shell.apices.forEach((apex, i) => {
    const name = spec.roots.length === 1 ? 'Apex' : `${spec.roots[i][0]} apex`
    const axis = shell.axes[i]
    const before = axis.at(Math.max(axis.length - 1.2, 0))
    marks.push({ name, anchor: apex, normal: normalize(sub(apex, before)) })
  })
  landmarkCache.set(key, marks)
  return marks
}

/* ---------- The arch ---------- */

export interface PlacedTooth {
  fdi: number
  arch: Arch
  position: number
  /** Patient's right teeth are mirror images; their matrix flips handedness. */
  mirrored: boolean
  /** Tooth frame to world, as a 4 × 4 column-major matrix. */
  matrix: number[]
  /** Along the arch from the middle, in mm, for the opening wave. */
  along: number
  /** Where a number chip sits, in the tooth's frame: just past the biting edge, a little toward the lips. */
  chip: Vec3
}

/** The arch line through the biting edges: z = front - (a x² + b x⁴), with a and b found so the canine and the first
    molar land at typical widths. Upper sits a little forward of lower (overjet). */
const ARCH_FORM: Record<Arch, { front: number; canine: number; molar: number }> = {
  upper: { front: 2.8, canine: 17.2, molar: 24.6 },
  lower: { front: 0, canine: 13.4, molar: 22.2 },
}

/** Crown tilts in degrees: mesial tip and facial torque of the long axis. */
const TIP: Record<Arch, number[]> = { upper: [0, 4, 7, 9, 3, 3, 4, 4, 4], lower: [0, 2, 2, 5, 2, 2, 3, 3, 3] }
const TORQUE: Record<Arch, number[]> = { upper: [0, 16, 12, 7, 2, 1, 4, 4, 2], lower: [0, 12, 10, 5, -4, -7, -10, -12, -12] }

function archCurve(arch: Arch): { at: (s: number) => { x: number; z: number; tx: number; tz: number } } {
  const form = ARCH_FORM[arch]
  const widths = SPECS.filter((s) => s.arch === arch).sort((a, b) => a.position - b.position).map((s) => s.md)
  const sCanine = widths[0] + widths[1] + widths[2] / 2
  const sMolar = widths.slice(0, 5).reduce((a, b) => a + b, 0) + widths[5] / 2
  const xAt = (a: number, b: number, s: number) => {
    // Arc length of z = -(a x² + b x⁴) from 0 to x, inverted by stepping.
    let x = 0
    let acc = 0
    const h = 0.05
    while (acc < s) {
      const slope = 2 * a * (x + h / 2) + 4 * b * (x + h / 2) ** 3
      const step = h * Math.sqrt(1 + slope * slope)
      if (acc + step >= s) return x + (h * (s - acc)) / step
      acc += step
      x += h
    }
    return x
  }
  let a = 0.02
  let b = 3e-5
  for (let i = 0; i < 40; i++) {
    const f1 = xAt(a, b, sCanine) - form.canine
    const f2 = xAt(a, b, sMolar) - form.molar
    if (Math.abs(f1) + Math.abs(f2) < 1e-6) break
    const da = 1e-5
    const db = 1e-8
    const j11 = (xAt(a + da, b, sCanine) - form.canine - f1) / da
    const j12 = (xAt(a, b + db, sCanine) - form.canine - f1) / db
    const j21 = (xAt(a + da, b, sMolar) - form.molar - f2) / da
    const j22 = (xAt(a, b + db, sMolar) - form.molar - f2) / db
    const det = j11 * j22 - j12 * j21
    a -= (f1 * j22 - f2 * j12) / det
    b -= (j11 * f2 - j21 * f1) / det
  }
  return {
    at(s) {
      const x = xAt(a, b, s)
      const slope = 2 * a * x + 4 * b * x ** 3
      const len = Math.hypot(1, slope)
      return { x, z: form.front - (a * x * x + b * x ** 4), tx: 1 / len, tz: -slope / len }
    },
  }
}

type Mat3 = [Vec3, Vec3, Vec3]
/** Columns: where the tooth's x, y and z go. */
const rotX = (a: number): Mat3 => [[1, 0, 0], [0, Math.cos(a), Math.sin(a)], [0, -Math.sin(a), Math.cos(a)]]
const rotZ = (a: number): Mat3 => [[Math.cos(a), Math.sin(a), 0], [-Math.sin(a), Math.cos(a), 0], [0, 0, 1]]
const apply = (m: Mat3, v: Vec3): Vec3 => add(add(scale(m[0], v[0]), scale(m[1], v[1])), scale(m[2], v[2]))
const compose = (m: Mat3, n: Mat3): Mat3 => [apply(m, n[0]), apply(m, n[1]), apply(m, n[2])]

let layoutCache: PlacedTooth[] | null = null

/** All 32 teeth in place: the patient's right on the viewer's left, each tooth tipped and torqued a little. */
export function archLayout(): PlacedTooth[] {
  if (layoutCache) return layoutCache
  const placed: PlacedTooth[] = []
  for (const arch of ['upper', 'lower'] as const) {
    const curve = archCurve(arch)
    const up = arch === 'lower' ? 1 : -1
    let along = 0
    for (let position = 1; position <= 8; position++) {
      const spec = SPEC_BY_KEY.get(`${arch}${position}`)!
      const s = along + spec.md / 2
      along += spec.md
      const p = curve.at(s)
      // The patient's left side (x > 0); the right side is its mirror image.
      const mesial: Vec3 = [-p.tx, 0, -p.tz]
      const facial: Vec3 = [-p.tz, 0, p.tx]
      const basis: Mat3 = [mesial, [0, up, 0], facial]
      const rotation = compose(compose(basis, rotX(TORQUE[arch][position] * DEG)), rotZ(-TIP[arch][position] * DEG))
      // The biting reference (incisal edge or middle of the biting surface) sits on the arch line at the biting level.
      const front = position <= 3
      const reference: Vec3 = [0, spec.crownH - (front ? 0 : 1.2), spec.shiftZ]
      const level = (front ? (arch === 'upper' ? -1 : 1) : arch === 'upper' ? -0.3 : 0.3) + 0.0025 * Math.max(0, s - 20) ** 1.7
      const target: Vec3 = [p.x, level, p.z]
      const origin = sub(target, apply(rotation, reference))
      const chip: Vec3 = [0, spec.crownH + 2.6, spec.bl * spec.facial * 0.6]
      for (const side of ['left', 'right'] as const) {
        const quadrant = arch === 'upper' ? (side === 'right' ? 1 : 2) : side === 'right' ? 4 : 3
        const flip = side === 'right' ? -1 : 1
        const m = rotation.map((col) => [col[0] * flip, col[1], col[2]] as Vec3)
        const o: Vec3 = [origin[0] * flip, origin[1], origin[2]]
        const det = m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[1][0] * (m[0][1] * m[2][2] - m[0][2] * m[2][1]) + m[2][0] * (m[0][1] * m[1][2] - m[0][2] * m[1][1])
        placed.push({
          fdi: quadrant * 10 + position,
          arch,
          position,
          mirrored: det < 0,
          matrix: [...m[0], 0, ...m[1], 0, ...m[2], 0, ...o, 1],
          along: s,
          chip,
        })
      }
    }
  }
  layoutCache = placed
  return placed
}

/** A tooth-frame point in the world. */
export function toWorld(matrix: number[], p: Vec3): Vec3 {
  return [
    matrix[0] * p[0] + matrix[4] * p[1] + matrix[8] * p[2] + matrix[12],
    matrix[1] * p[0] + matrix[5] * p[1] + matrix[9] * p[2] + matrix[13],
    matrix[2] * p[0] + matrix[6] * p[1] + matrix[10] * p[2] + matrix[14],
  ]
}

/* ---------- Gum and jaw ---------- */

/** Catmull-Rom through points, closed or open, sampled densely. */
function spline2(points: [number, number][], closed: boolean, perSegment: number): [number, number][] {
  const out: [number, number][] = []
  const n = points.length
  const get = (i: number) => (closed ? points[((i % n) + n) % n] : points[clamp(i, 0, n - 1)])
  const segments = closed ? n : n - 1
  for (let i = 0; i < segments; i++) {
    const [p0, p1, p2, p3] = [get(i - 1), get(i), get(i + 1), get(i + 2)]
    for (let k = 0; k < perSegment; k++) {
      const t = k / perSegment
      const t2 = t * t
      const t3 = t2 * t
      out.push([0, 1].map((d) => 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)) as [number, number])
    }
  }
  if (!closed) out.push(points[n - 1])
  return out
}

/** Resamples a polyline (closed or open) to count points evenly spaced along it. */
function resample(points: [number, number][], count: number, closed: boolean): { pts: [number, number][]; total: number; at: number[] } {
  const pts = closed ? [...points, points[0]] : points
  const lengths = [0]
  for (let i = 1; i < pts.length; i++) lengths.push(lengths[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  const total = lengths[lengths.length - 1]
  const out: [number, number][] = []
  const at: number[] = []
  let j = 1
  const n = closed ? count : count - 1
  for (let i = 0; i < count; i++) {
    const target = (i / n) * total
    while (j < pts.length - 1 && lengths[j] < target) j++
    const f = clamp((target - lengths[j - 1]) / (lengths[j] - lengths[j - 1] || 1), 0, 1)
    out.push([lerp(pts[j - 1][0], pts[j][0], f), lerp(pts[j - 1][1], pts[j][1], f)])
    at.push(target)
  }
  return { pts: out, total, at }
}

const gums = new Map<Arch, MeshData>()

/**
 * One jaw's gum and bone as a closed, rounded horseshoe around the roots. Its top follows each tooth's neck with a
 * scalloped gum line, rising to a papilla between teeth.
 */
export function gumMesh(arch: Arch): MeshData {
  const cached = gums.get(arch)
  if (cached) return cached
  const up = arch === 'lower' ? 1 : -1
  const layout = archLayout()
  const row = ROWS[arch]
  const teeth = row.map((fdi) => {
    const t = layout.find((p) => p.fdi === fdi)!
    const spec = specOf(fdi)
    const shape = new Shape(spec, 'shell')
    const neck = toWorld(t.matrix, [0, 0, 0])
    const deepest = Math.min(...shellOf(fdi).apices.map((a) => up * toWorld(t.matrix, a)[1]))
    // Gum line about 1 mm toward the biting edge from the junction, on the facial and lingual sides.
    const facialCej = up * toWorld(t.matrix, shape.wallPoint(Math.PI / 2, 0))[1]
    const lingualCej = up * toWorld(t.matrix, shape.wallPoint(-Math.PI / 2, 0))[1]
    return {
      neck,
      half: spec.md / 2,
      f: shape.wallRadius(Math.PI / 2, 0.08) + 0.35,
      l: shape.wallRadius(-Math.PI / 2, 0.08) + 0.35,
      mF: facialCej + 1.1,
      mL: lingualCej + 1.1,
      papilla: spec.position <= 3 ? 3.6 : 2.6,
      deep: deepest - 3,
    }
  })
  // The centre line through the necks, a little past the last molars at both ends.
  const pts = teeth.map((t) => [t.neck[0], t.neck[2]] as [number, number])
  const ext = (a: [number, number], b: [number, number]): [number, number] => {
    const d = Math.hypot(a[0] - b[0], a[1] - b[1])
    return [a[0] + ((a[0] - b[0]) / d) * 7.5, a[1] + ((a[1] - b[1]) / d) * 7.5]
  }
  const line = spline2([ext(pts[0], pts[1]), ...pts, ext(pts[pts.length - 1], pts[pts.length - 2])], false, 12)
  const stationCount = 210
  const { pts: stations, at } = resample(line, stationCount, false)
  // Each tooth's place along the line.
  const toothAt = teeth.map((t) => {
    let best = 0
    for (let i = 1; i < stationCount; i++) if (Math.hypot(stations[i][0] - t.neck[0], stations[i][1] - t.neck[2]) < Math.hypot(stations[best][0] - t.neck[0], stations[best][1] - t.neck[2])) best = i
    return at[best]
  })
  const blended = (a: number, pick: (t: (typeof teeth)[number]) => number) => {
    let sum = 0
    let weight = 0
    teeth.forEach((t, i) => {
      const w = bell(a - toothAt[i], t.half * 1.2) + 1e-9
      sum += w * pick(t)
      weight += w
    })
    return sum / weight
  }
  // The gum line: each tooth's neck sits in a bowl that rises to a papilla between it and its neighbours. A soft
  // minimum joins the bowls, so the papillae come to rounded points rather than creases.
  const scallop = (a: number, side: 'mF' | 'mL') => {
    const heights = teeth.map((t, i) => t[side] + (side === 'mF' ? 1 : 0.85) * t.papilla * Math.min(Math.abs(a - toothAt[i]) / t.half, 1.3) ** 2.4)
    const m = Math.min(...heights)
    return m - 0.3 * Math.log(heights.reduce((sum, h) => sum + Math.exp(-(h - m) / 0.3), 0))
  }
  // The jaw's lower edge: below every root tip, then smoothed along the arch so it reads as one rounded body.
  const envelope = at.map((a) => Math.min(...teeth.map((t, i) => t.deep + 2.5 * ((a - toothAt[i]) / 18) ** 2)))
  const deepAt = envelope.map((_, k) => {
    let sum = 0
    let n = 0
    for (let j = 0; j < stationCount; j++) {
      if (Math.abs(at[j] - at[k]) > 10) continue
      sum += envelope[j]
      n++
    }
    return sum / n - 0.6
  })
  /* Each section is a closed curve through 16 control points, sampled at fixed places on the curve, so a point keeps its
     place from one section to the next and the walls stay smooth along the arch: the gum line's bumps stay at the top. */
  const PER = 3
  const CONTROLS = 16
  const SECTION = CONTROLS * PER
  const BOTTOM = 8 * PER
  const sections: Vec3[][] = []
  const depths: number[][] = []
  const vAround: number[][] = []
  for (let k = 0; k < stationCount; k++) {
    const [px, pz] = stations[k]
    const [qx, qz] = stations[Math.min(k + 1, stationCount - 1)]
    const [ox, oz] = stations[Math.max(k - 1, 0)]
    const tl = Math.hypot(qx - ox, qz - oz)
    const nx = (qz - oz) / tl
    const nz = -(qx - ox) / tl
    const a = at[k]
    const f = blended(a, (t) => t.f)
    const l = blended(a, (t) => t.l)
    const gF = scallop(a, 'mF')
    const gL = scallop(a, 'mL')
    const deep = deepAt[k]
    const mid = (l - f) / 2
    const between = smooth(0.6, 1, Math.min(...teeth.map((t, i) => Math.abs(a - toothAt[i]) / t.half)))
    const top = Math.max(gF, gL) - 0.6 - 0.8 * between
    // A rounded alveolar body: gum lines hugging the neck, walls bulging a little over the roots, a rounded underside.
    const control: [number, number][] = [
      [mid, top],
      [-(f - 0.6), gF + 0.2],
      [-f, gF],
      [-(f + 0.75), gF - 1.1],
      [-(f + 1.5), gF - 4],
      [-(f + 1.9), lerp(gF, deep, 0.5)],
      [-(f + 1.4), lerp(gF, deep, 0.8)],
      [-(f * 0.45 + 0.6), deep + 0.8],
      [mid * 0.5, deep - 0.4],
      [l * 0.45 + 0.6, deep + 0.8],
      [l + 1.3, lerp(gL, deep, 0.8)],
      [l + 1.7, lerp(gL, deep, 0.5)],
      [l + 1.3, gL - 4],
      [l + 0.7, gL - 1.1],
      [l, gL],
      [l - 0.6, gL + 0.2],
    ]
    // Past the last teeth the body rounds off toward the middle of its section.
    const endFade = Math.min(smooth(0, 5, a), smooth(0, 5, at[stationCount - 1] - a))
    const cy = (top + deep) / 2
    const closed = control.map(([w, h]) => [mid + (w - mid) * (0.25 + 0.75 * endFade), cy + (h - cy) * (0.35 + 0.65 * endFade)] as [number, number])
    const section = spline2(closed, true, PER)
    sections.push(section.map(([w, h]) => [px + w * nx, up * h, pz + w * nz]))
    depths.push(section.map(([, h]) => Math.max(0, Math.max(gF, gL) - h)))
    // Around the section, measured both ways from the underside, so the grid's long lines run evenly along the walls.
    const around = [0]
    for (let i = 1; i <= SECTION; i++) around.push(around[i - 1] + Math.hypot(section[i % SECTION][0] - section[i - 1][0], section[i % SECTION][1] - section[i - 1][1]))
    vAround.push(around.map((v) => v - around[BOTTOM]))
  }
  // Along the arch, each long line measures its own length from the middle of the mouth, so cells stay even on the
  // outer and inner walls alike.
  const middle = Math.floor(stationCount / 2)
  const uAlong: number[][] = sections.map(() => new Array(SECTION).fill(0))
  for (let k = middle + 1; k < stationCount; k++) for (let i = 0; i < SECTION; i++) uAlong[k][i] = uAlong[k - 1][i] + length(sub(sections[k][i], sections[k - 1][i]))
  for (let k = middle - 1; k >= 0; k--) for (let i = 0; i < SECTION; i++) uAlong[k][i] = uAlong[k + 1][i] - length(sub(sections[k][i], sections[k + 1][i]))
  const parts: Part[] = []
  const body = newPart()
  for (let k = 0; k < stationCount; k++) {
    for (let i = 0; i <= SECTION; i++) {
      const p = sections[k][i % SECTION]
      body.positions.push(...p)
      body.grid.push(uAlong[k][i % SECTION], vAround[k][i], depths[k][i % SECTION])
    }
  }
  const rowSize = SECTION + 1
  for (let k = 0; k < stationCount - 1; k++) {
    for (let i = 0; i < SECTION; i++) {
      const a = k * rowSize + i
      const b = a + 1
      const c = a + rowSize
      const d = c + 1
      if (up > 0) body.indices.push(a, b, c, b, d, c)
      else body.indices.push(a, c, b, b, c, d)
    }
  }
  // Caps at both ends.
  for (const [k, outward] of [[0, -1], [stationCount - 1, 1]] as const) {
    const ring = sections[k]
    const centre = scale(ring.reduce((s2, p) => add(s2, p), [0, 0, 0] as Vec3), 1 / SECTION)
    const start = body.positions.length / 3
    body.positions.push(...centre)
    body.grid.push(uAlong[k][0], 0, 6)
    for (let i = 0; i < SECTION; i++) {
      const a = k * rowSize + i
      if ((outward > 0) === up > 0) body.indices.push(a, a + 1, start)
      else body.indices.push(a, start, a + 1)
    }
  }
  parts.push(body)
  const mesh = finish(parts)
  gums.set(arch, mesh)
  return mesh
}
