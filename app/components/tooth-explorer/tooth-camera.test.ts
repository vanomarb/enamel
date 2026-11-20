import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Vec3 } from './anatomy-model.ts'
import { FOV, MAX_ZOOM_OUT, MIN_DISTANCE, PITCH_RANGE, REST_PITCH, archShown, axes, cameraPosition, clampDistance, clampPitch, decay, fitPoints, focusAngles, lerpView, restAngles, wrapYaw, zoomAbout, type View } from './tooth-camera.ts'

const DEG = Math.PI / 180
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps

test('at rest the camera faces the front teeth, about a third of the way above the lower arch and below the upper one', () => {
  assert.ok(REST_PITCH >= 30 * DEG && REST_PITCH <= 35 * DEG)
  assert.deepEqual(restAngles('lower'), { yaw: 0, pitch: REST_PITCH })
  assert.deepEqual(restAngles('upper'), { yaw: 0, pitch: -REST_PITCH })
  // Yaw 0 puts the camera in front (+z) with x to its right: the patient's right, at negative x, is on the viewer's left.
  const { right, forward } = axes(0, 20 * DEG)
  assert.ok(near(right[0], 1) && forward[2] < 0)
  assert.ok(FOV >= 30 && FOV <= 35)
})

test('pitch stays on the arch’s own side of the biting plane; yaw turns all the way round', () => {
  const [low, high] = PITCH_RANGE
  assert.equal(clampPitch(-30 * DEG, 'lower'), low, 'never below the lower arch')
  assert.equal(clampPitch(89 * DEG, 'lower'), high)
  assert.equal(clampPitch(30 * DEG, 'upper'), -low, 'never above the upper arch')
  assert.equal(clampPitch(-89 * DEG, 'upper'), -high)
  assert.equal(clampPitch(35 * DEG, 'lower'), 35 * DEG)
  assert.ok(near(wrapYaw(2 * Math.PI + 0.3), 0.3) && near(wrapYaw(-Math.PI - 0.2), Math.PI - 0.2))
  // Within the pitch range only one arch shows; both show only on the way between them, near the biting plane.
  assert.ok(archShown('lower', low) && !archShown('upper', low))
  assert.ok(archShown('upper', -low) && !archShown('lower', -low))
  assert.ok(archShown('upper', 0) && archShown('lower', 0))
})

test('zoom stays between one molar’s cusps and a little past the whole arch', () => {
  assert.equal(clampDistance(2, 200), MIN_DISTANCE)
  assert.equal(clampDistance(1000, 200), 200 * MAX_ZOOM_OUT)
  assert.equal(clampDistance(120, 200), 120)
  const view: View = { target: [0, 0, 0], distance: 100, yaw: 0, pitch: 0.3 }
  assert.equal(zoomAbout(view, 0.01, 100).distance, MIN_DISTANCE)
  // Zooming about a point slides the aim toward it, so the point stays under the pointer.
  const closer = zoomAbout(view, 0.5, 100, [10, 0, 0])
  assert.equal(closer.distance, 50)
  assert.deepEqual(closer.target, [5, 0, 0])
})

test('a fitted view keeps every point inside the frame', () => {
  const points: Vec3[] = [[-30, 0, 0], [30, 0, 0], [0, 10, -40], [0, -20, 5], [25, 8, -30]]
  for (const [yaw, pitch, aspect] of [[0, 20 * DEG, 1.25], [1.2, 40 * DEG, 1], [-2.5, 12 * DEG, 0.8]]) {
    const fit = fitPoints(points, yaw, pitch, aspect, 0.1)
    const { forward, right, up } = axes(yaw, pitch)
    const eye = cameraPosition({ ...fit, yaw, pitch })
    const tanV = Math.tan((FOV / 2) * DEG)
    for (const p of points) {
      const o: Vec3 = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]]
      const z = o[0] * forward[0] + o[1] * forward[1] + o[2] * forward[2]
      const x = (o[0] * right[0] + o[1] * right[1] + o[2] * right[2]) / z
      const y = (o[0] * up[0] + o[1] * up[1] + o[2] * up[2]) / z
      assert.ok(z > 0 && Math.abs(x) <= tanV * aspect + 1e-6 && Math.abs(y) <= tanV + 1e-6, `point ${p} in view`)
    }
  }
})

test('flying to a tooth faces its lip or cheek side, nearly level, and frames it', () => {
  // A lower left molar's cheek side faces the patient's left: the camera swings round to look at it from there.
  const molar = focusAngles([0.97, 0, 0.24], 'lower')
  assert.ok(molar.yaw > 60 * DEG && molar.yaw < 90 * DEG)
  assert.ok(molar.pitch > 0 && molar.pitch <= PITCH_RANGE[0] + 6 * DEG, 'just above, on the lower arch’s side')
  const incisor = focusAngles([0, 0, 1], 'upper')
  assert.ok(near(incisor.yaw, 0) && incisor.pitch < 0)
  // The tooth's frame (its points out of the socket) becomes the aim: the fit centres on it.
  const tooth: Vec3[] = [[20, 5, -20], [24, 5, -20], [22, 30, -18], [22, 30, -22]]
  const fit = fitPoints(tooth, molar.yaw, molar.pitch, 1.25)
  assert.ok(Math.hypot(fit.target[0] - 22, fit.target[2] + 20) < 3 && fit.target[1] > 5 && fit.target[1] < 30)
  // The flight takes the short way round and eases the distance.
  const from: View = { target: [0, 0, 0], distance: 200, yaw: 170 * DEG, pitch: 0.3 }
  const to: View = { target: [10, 0, 0], distance: 50, yaw: -170 * DEG, pitch: 0.2 }
  const middle = lerpView(from, to, 0.5)
  assert.ok(near(Math.abs(wrapYaw(middle.yaw)), Math.PI, 1e-6), 'through 180°, not through 0°')
  assert.ok(near(middle.distance, 100, 1e-6) && near(middle.target[0], 5))
})

test('inertia fades and stops', () => {
  let speed = 0.002
  for (let i = 0; i < 200; i++) speed = decay(speed, 16)
  assert.equal(speed, 0)
  assert.ok(decay(0.002, 16) < 0.002 && decay(0.002, 16) > 0)
})
