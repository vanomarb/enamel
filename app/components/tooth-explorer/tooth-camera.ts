import type { Arch } from './arch.ts'
import type { Vec3 } from './anatomy-model.ts'

/* The camera as plain numbers: where it orbits, how far it stands, and how it flies between views. tooth-view.ts hands
   the result to three.js. Angles are radians; yaw 0 looks at the front teeth head on, and positive pitch looks down. */

const DEG = Math.PI / 180

/** Vertical field of view, in degrees: enough perspective for the arch to recede like a photograph. */
export const FOV = 32

/** At rest the camera faces the bite from a little above, like a smile seen across a table. */
export const REST_PITCH = 10 * DEG

/** Turning stops at the side of the arch, so the camera never swings round to the tongue side. */
export const YAW_LIMIT = 80 * DEG

/** Tilt: from below for the upper biting surfaces, from above for the lower ones. */
export const PITCH_RANGE: [number, number] = [-30 * DEG, 45 * DEG]

/** In the close-up the tooth is lifted clear of the others, so the camera may tilt further to see its biting surface. */
export const FOCUS_PITCH_RANGE: [number, number] = [-60 * DEG, 60 * DEG]

/** Nearest the camera comes, in mm: one molar's cusps and grid fill the view. */
export const MIN_DISTANCE = 16

/** How far past the whole-mouth view the camera may back off. */
export const MAX_ZOOM_OUT = 1.3

/** The jaw joint, in mm (x, y, z): the lower jaw turns about a line through here, parallel to x, behind and above the
    last molars. */
export const JAW_HINGE: Vec3 = [0, 20, -80]

/** How far apart the upper and lower incisal edges are when the mouth is open, in mm. */
export const OPEN_GAP = 12

export interface View {
  target: Vec3
  distance: number
  yaw: number
  pitch: number
}

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))

export function clampYaw(yaw: number): number {
  return clamp(yaw, -YAW_LIMIT, YAW_LIMIT)
}

/** Pitch within the arch view's range, or the close-up's wider one. */
export function clampPitch(pitch: number, closeUp = false): number {
  const [low, high] = closeUp ? FOCUS_PITCH_RANGE : PITCH_RANGE
  return clamp(pitch, low, high)
}

/** Yaw folded into (-π, π]. */
export function wrapYaw(yaw: number): number {
  return yaw - 2 * Math.PI * Math.round(yaw / (2 * Math.PI))
}

/** The distance range for a view whose whole subject fits at distance fit. */
export function clampDistance(distance: number, fit: number): number {
  return clamp(distance, MIN_DISTANCE, Math.max(fit * MAX_ZOOM_OUT, MIN_DISTANCE))
}

export function restAngles(): { yaw: number; pitch: number } {
  return { yaw: 0, pitch: REST_PITCH }
}

/** The camera's axes: forward (from the camera toward the target), right and up. */
export function axes(yaw: number, pitch: number): { forward: Vec3; right: Vec3; up: Vec3 } {
  const cp = Math.cos(pitch)
  const forward: Vec3 = [-cp * Math.sin(yaw), -Math.sin(pitch), -cp * Math.cos(yaw)]
  const right: Vec3 = [Math.cos(yaw), 0, -Math.sin(yaw)]
  const up: Vec3 = [right[1] * forward[2] - right[2] * forward[1], right[2] * forward[0] - right[0] * forward[2], right[0] * forward[1] - right[1] * forward[0]]
  return { forward, right, up }
}

export function cameraPosition(view: View): Vec3 {
  const { forward } = axes(view.yaw, view.pitch)
  return [view.target[0] - forward[0] * view.distance, view.target[1] - forward[1] * view.distance, view.target[2] - forward[2] * view.distance]
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/**
 * The aim and distance that fit every point in the view at these angles, with a share of the frame left free around
 * them (margin 0.1 leaves a tenth on each side; marginY, if given, top and bottom). Refined a few times, recentring on
 * what the camera sees.
 */
export function fitPoints(points: Vec3[], yaw: number, pitch: number, aspect: number, margin = 0.08, marginY = margin): { target: Vec3; distance: number } {
  const { forward, right, up } = axes(yaw, pitch)
  const tan = Math.tan((FOV / 2) * DEG)
  const tanV = tan * (1 - 2 * marginY)
  const tanH = tan * aspect * (1 - 2 * margin)
  const n = points.length || 1
  let target: Vec3 = [0, 0, 0]
  for (const p of points) target = [target[0] + p[0] / n, target[1] + p[1] / n, target[2] + p[2] / n]
  let distance = 1
  for (let pass = 0; pass < 4; pass++) {
    distance = 1
    for (const p of points) {
      const o: Vec3 = [p[0] - target[0], p[1] - target[1], p[2] - target[2]]
      const z = dot(o, forward)
      distance = Math.max(distance, Math.abs(dot(o, right)) / tanH - z, Math.abs(dot(o, up)) / tanV - z)
    }
    let [left, rightmost, low, high] = [Infinity, -Infinity, Infinity, -Infinity]
    for (const p of points) {
      const o: Vec3 = [p[0] - target[0], p[1] - target[1], p[2] - target[2]]
      const depth = distance + dot(o, forward)
      const x = dot(o, right) / depth
      const y = dot(o, up) / depth
      left = Math.min(left, x)
      rightmost = Math.max(rightmost, x)
      low = Math.min(low, y)
      high = Math.max(high, y)
    }
    const dx = ((left + rightmost) / 2) * distance
    const dy = ((low + high) / 2) * distance
    target = [target[0] + right[0] * dx + up[0] * dy, target[1] + right[1] * dx + up[1] * dy, target[2] + right[2] * dx + up[2] * dy]
  }
  return { target, distance }
}

/**
 * The aim's offset from the subject's centre, cut back so that centre stays inside the frame: within share of the
 * half-width and half-height, for a camera this far from the aim. The part along the line of sight is kept (zooming
 * toward the pointer brings the aim nearer), short of putting the centre behind the camera.
 */
export function clampPan(pan: Vec3, yaw: number, pitch: number, distance: number, aspect: number, share = 0.9): Vec3 {
  const { forward, right, up } = axes(yaw, pitch)
  const f = Math.min(dot(pan, forward), distance * 0.75)
  const depth = distance - f
  const tan = Math.tan((FOV / 2) * DEG) * share
  const x = clamp(dot(pan, right), -tan * aspect * depth, tan * aspect * depth)
  const y = clamp(dot(pan, up), -tan * depth, tan * depth)
  return [forward[0] * f + right[0] * x + up[0] * y, forward[1] * f + right[1] * x + up[1] * y, forward[2] * f + right[2] * x + up[2] * y]
}

/** The close-up's angles: facing the tooth's lip or cheek side, nearly level with it, on its arch's side; never past the
    side of the arch. */
export function focusAngles(facial: Vec3, arch: Arch): { yaw: number; pitch: number } {
  return { yaw: clampYaw(Math.atan2(facial[0], facial[2])), pitch: arch === 'lower' ? 12 * DEG : -12 * DEG }
}

/** Between two views; yaw takes the short way round. */
export function lerpView(a: View, b: View, t: number): View {
  const yaw = a.yaw + wrapYaw(b.yaw - a.yaw) * t
  return {
    target: [a.target[0] + (b.target[0] - a.target[0]) * t, a.target[1] + (b.target[1] - a.target[1]) * t, a.target[2] + (b.target[2] - a.target[2]) * t],
    distance: a.distance * (b.distance / a.distance) ** t,
    yaw,
    pitch: a.pitch + (b.pitch - a.pitch) * t,
  }
}

export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
export const easeOut = (t: number) => 1 - (1 - t) ** 3

/** Inertia: a turning speed after dt ms, fading with time constant tau ms. */
export function decay(speed: number, dt: number, tau = 240): number {
  const next = speed * Math.exp(-dt / tau)
  return Math.abs(next) < 1e-5 ? 0 : next
}

/**
 * Zooms by factor about a world point (the one under the pointer), keeping that point where it is on screen: the aim
 * slides toward it as the camera comes closer. The distance stays within the zoom bounds for a view that fits at fit.
 */
export function zoomAbout(view: View, factor: number, fit: number, point?: Vec3): View {
  const distance = clampDistance(view.distance * factor, fit)
  const k = 1 - distance / view.distance
  const target: Vec3 = point ? [view.target[0] + (point[0] - view.target[0]) * k, view.target[1] + (point[1] - view.target[1]) * k, view.target[2] + (point[2] - view.target[2]) * k] : view.target
  return { ...view, target, distance }
}

/** A point on the lower jaw once the jaw has turned this far open (radians) about the hinge. */
export function jawPoint(p: Vec3, angle: number, hinge: Vec3 = JAW_HINGE): Vec3 {
  const dy = p[1] - hinge[1]
  const dz = p[2] - hinge[2]
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return [p[0], hinge[1] + dy * c - dz * s, hinge[2] + dy * s + dz * c]
}

/** How far the lower jaw turns open so its incisal edge drops gap mm below the upper one. */
export function openAngle(upperEdge: Vec3, lowerEdge: Vec3, gap = OPEN_GAP, hinge: Vec3 = JAW_HINGE): number {
  const dy = lowerEdge[1] - hinge[1]
  const dz = lowerEdge[2] - hinge[2]
  const reach = Math.hypot(dy, dz)
  const goal = upperEdge[1] - gap - hinge[1]
  return Math.acos(clamp(goal / reach, -1, 1)) - Math.atan2(dz, dy)
}

/** A ball; the unit ball at the origin unless said otherwise. */
export interface Ball {
  centre: Vec3
  radius: number
}

/** Whether a surface at point, turned toward normal, faces the eye, give or take slack (0 is side-on). */
export function facing(normal: Vec3, point: Vec3, eye: Vec3, slack = 0.2): boolean {
  const toEye: Vec3 = [eye[0] - point[0], eye[1] - point[1], eye[2] - point[2]]
  return dot(normal, toEye) > -slack * (Math.hypot(...normal) * Math.hypot(...toEye))
}

/**
 * Whether the line of sight from one point to another passes through a ball. tooth-view.ts asks it of each crown, with
 * both points moved into the frame where that crown is the unit ball.
 */
export function crossesBall(from: Vec3, to: Vec3, ball: Ball = { centre: [0, 0, 0], radius: 1 }): boolean {
  const d: Vec3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]]
  const o: Vec3 = [ball.centre[0] - from[0], ball.centre[1] - from[1], ball.centre[2] - from[2]]
  const t = clamp(dot(o, d) / (dot(d, d) || 1), 0, 1)
  const gap: Vec3 = [o[0] - d[0] * t, o[1] - d[1] * t, o[2] - d[2] * t]
  return dot(gap, gap) < ball.radius * ball.radius
}
