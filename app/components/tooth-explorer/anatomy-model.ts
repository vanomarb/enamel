/* Enamel's 3D teeth, gums and arch as plain numbers, generated from textbook averages by the modules in anatomy/;
   tooth-view.ts turns them into three.js meshes. Nothing is loaded: every surface comes from the parameters in
   anatomy/specs.ts.

   Units are millimetres. Each tooth is built in its own frame: x toward the middle of the mouth (mesial), y toward the
   biting edge (occlusal), z toward the lips and cheeks (facial), with the cementoenamel junction's facial point at
   y = 0. The world frame puts x to the viewer's right (the patient's left), y up and z toward the viewer, with the
   biting plane at y = 0. A tooth on one side is the mirror image of its partner on the other.

   anatomy/specs.ts      the 16 kinds of tooth as numbers
   anatomy/shape.ts      a tooth's surface as functions: crown sides, biting surface, cementoenamel junction, root
   anatomy/tooth.ts      the closed outer shell, sampled from the shape in rings
   anatomy/layers.ts     enamel cap, dentin, pulp chamber and canals
   anatomy/landmarks.ts  named points and lines on the surface
   anatomy/layout.ts     the two arches
   anatomy/gum.ts        gum and jaw bone */

export type { Vec3 } from './anatomy/maths.ts'
export { CELL, type MeshData } from './anatomy/mesh.ts'
export { canalCount, rootCount, shapeKey, toothSizes } from './anatomy/specs.ts'
export { toothApices, toothShell } from './anatomy/tooth.ts'
export { toothLayers, type ToothLayers } from './anatomy/layers.ts'
export { toothLandmarks, type Landmark } from './anatomy/landmarks.ts'
export { archLayout, toWorld, type PlacedTooth } from './anatomy/layout.ts'
export { gumMesh } from './anatomy/gum.ts'
