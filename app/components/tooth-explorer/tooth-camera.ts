import type { Arch } from './arch.ts'
import type { Vec3 } from './anatomy-model.ts'

/* The camera as plain numbers: where it orbits, how far it stands, and how it flies between views. tooth-view.ts hands
   the result to three.js. Angles are radians; yaw 0 looks at the front teeth head on, and positive pitch looks down. */

const DEG = Math.PI / 180

/** Vertical field of view, in degrees: enough perspective for the arch to recede like a photograph. */
export const FOV = 32

/** At rest the camera faces the front teeth from about a third of the way up (lower arch) or down (upper arch): high
    enough for the arch to recede and the back teeth's chewing surfaces to show. */
export const REST_PITCH = 32 * DEG

/** Pitch stays on the arch's own side of the biting plane, so the camera never passes through the gum. */
export const PITCH_RANGE: [number, number] = [8 * DEG, 75 * DEG]

/** Nearest the camera comes, in mm: one molar's cusps and grid fill the view. */
export const MIN_DISTANCE = 16

/** How far past the whole-arch view the camera may back off. */
export const MAX_ZOOM_OUT = 1.3

export interface View {
  target: Vec3
  distance: number
  yaw: number
  pitch: number
}

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))

export function clampPitch(pitch: number, arch: Arch): number {
  const [low, high] = PITCH_RANGE
  return arch === 'lower' ? clamp(pitch, low, high) : clamp(pitch, -high, -low)
}

/** Yaw folded into (-π, π]: the model turns all the way round. */
export function wrapYaw(yaw: number): number {
  return yaw - 2 * Math.PI * Math.round(yaw / (2 * Math.PI))
}

/** The distance range for a view whose whole subject fits at distance fit. */
export function clampDistance(distance: number, fit: number): number {
  return clamp(distance, MIN_DISTANCE, Math.max(fit * MAX_ZOOM_OUT, MIN_DISTANCE))
}

export function restAngles(arch: Arch): { yaw: number; pitch: number } {
  return { yaw: 0, pitch: arch === 'lower' ? REST_PITCH : -REST_PITCH }
}

/** Whether an arch is drawn at a pitch: only its own, except close to the biting plane, where both show. */
export function archShown(arch: Arch, pitch: number): boolean {
  return arch === 'lower' ? pitch > -6 * DEG : pitch < 6 * DEG
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

/** The close-up's angles: facing the tooth's lip or cheek side, nearly level with it, on its arch's side. */
export function focusAngles(facial: Vec3, arch: Arch): { yaw: number; pitch: number } {
  return { yaw: Math.atan2(facial[0], facial[2]), pitch: arch === 'lower' ? 12 * DEG : -12 * DEG }
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
