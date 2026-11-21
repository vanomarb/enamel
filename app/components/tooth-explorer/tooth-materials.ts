import { Color, FrontSide, MeshStandardMaterial, SRGBColorSpace, type WebGLProgramParametersWithUniforms } from 'three'
import { CELL } from './anatomy-model.ts'

/* The model's look: matte shaded surfaces with a fine grid drawn over them, like a wireframe on a solid. The grid comes
   from each mesh's grid coordinates (anatomy-model.ts lays them out in mm along the surface), anti-aliased with fwidth.
   Lines crowding closer than about 3 px fade out, so the grid never shimmers when small. Near a tooth's poles, where
   the lines around it converge, every 2nd, 4th or 8th is kept instead. */

export interface Palette {
  enamel: Color
  /** The crown's grid: a darker shade of the enamel. */
  enamelLine: Color
  /** Below the neck: cementum, creamier than the enamel, under its own darker grid. */
  root: Color
  rootLine: Color
  grid: Color
  gum: Color
  /** The gum's grid: a darker shade of the gum. */
  gumLine: Color
  bone: Color
  chosen: Color
  hover: Color
  dentin: Color
  pulp: Color
  canal: Color
  /** The card behind the canvas: dimmed teeth fade toward it. */
  backdrop: Color
}

/** Resolves a theme colour through the cascade, then reads it back as sRGB from a 1 px canvas, so any CSS colour works. */
export function readPalette(root: HTMLElement): Palette {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const probe = document.createElement('span')
  probe.hidden = true
  root.append(probe)
  const read = (name: string, fallback: [number, number, number]) => {
    const colour = new Color().setRGB(...fallback, SRGBColorSpace)
    probe.style.color = `var(${name})`
    const css = getComputedStyle(probe).color
    if (!ctx || !css) return colour
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = 'rgb(0 0 0 / 0)'
    ctx.fillStyle = css
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
    return a === 0 ? colour : colour.setRGB(r / 255, g / 255, b / 255, SRGBColorSpace)
  }
  const palette = {
    enamel: read('--model-enamel', [0.98, 0.98, 0.96]),
    enamelLine: read('--model-enamel-grid', [0.58, 0.57, 0.55]),
    root: read('--model-root', [0.93, 0.9, 0.82]),
    rootLine: read('--model-root-grid', [0.57, 0.53, 0.46]),
    grid: read('--model-grid', [0.3, 0.37, 0.45]),
    gum: read('--model-gum', [0.86, 0.56, 0.56]),
    gumLine: read('--model-gum-grid', [0.62, 0.36, 0.38]),
    bone: read('--model-bone', [0.78, 0.47, 0.48]),
    chosen: read('--model-chosen', [0.96, 0.72, 0.52]),
    hover: read('--model-hover', [0.85, 0.55, 0.3]),
    dentin: read('--model-dentin', [0.92, 0.84, 0.66]),
    pulp: read('--model-pulp', [0.85, 0.42, 0.42]),
    canal: read('--model-canal', [0.75, 0.3, 0.32]),
    backdrop: read('--color-surface', [1, 1, 1]),
  }
  probe.remove()
  return palette
}

/** Uniforms every material shares: one write reaches them all. */
export interface SharedUniforms {
  /** 0 hides every grid, 1 draws it: the opening fades it in. */
  uGrid: { value: number }
  uBackdrop: { value: Color }
  uCell: { value: number }
  /** Line width in device pixels. */
  uWidth: { value: number }
}

export const sharedUniforms = (palette: Palette): SharedUniforms => ({ uGrid: { value: 1 }, uBackdrop: { value: palette.backdrop }, uCell: { value: CELL }, uWidth: { value: 1 } })

export interface GridUniforms extends SharedUniforms {
  uLine: { value: Color }
  /** How strongly the lines show (0 to 1). */
  uLineMix: { value: number }
  /** A hovered or focused tooth's lines warm toward this colour, by uHighlight. */
  uHover: { value: Color }
  uHighlight: { value: number }
  /** The chosen tooth takes on this colour, by uTintMix. */
  uTint: { value: Color }
  uTintMix: { value: number }
  /** 0 is the full colour, 1 fades it all the way to the backdrop. */
  uDim: { value: number }
  /** The gum's colour deep down, where it becomes bone. */
  uDeep: { value: Color }
  /** A tooth's root colour and its grid's, mixed in by uRootMix below the cementoenamel junction. */
  uRoot: { value: Color }
  uRootLine: { value: Color }
  uRootMix: { value: number }
}

export type GridMaterial = MeshStandardMaterial & { userData: { grid: GridUniforms } }

const VERTEX_PARS = /* glsl */ `
  #include <common>
  attribute vec3 grid;
  varying vec3 vGrid;
`

const VERTEX = /* glsl */ `
  #include <begin_vertex>
  vGrid = grid;
`

const FRAGMENT_PARS = /* glsl */ `
  #include <common>
  varying vec3 vGrid;
  uniform vec3 uLine;
  uniform float uLineMix;
  uniform vec3 uHover;
  uniform float uHighlight;
  uniform vec3 uTint;
  uniform float uTintMix;
  uniform float uDim;
  uniform vec3 uDeep;
  uniform vec3 uRoot;
  uniform vec3 uRootLine;
  uniform float uRootMix;
  uniform float uGrid;
  uniform vec3 uBackdrop;
  uniform float uCell;
  uniform float uWidth;

  // Coverage of the grid line nearest s (lines every cell): about uWidth pixels wide, fading out where neighbouring
  // lines would sit closer than about 3 pixels.
  float gridLine(float s, float cell) {
    float x = s / cell;
    float perPixel = max(fwidth(x), 1e-5);
    float d = abs(fract(x + 0.5) - 0.5) / perPixel;
    float line = 1.0 - smoothstep(0.5 * uWidth - 0.5, 0.5 * uWidth + 0.5, d);
    return line * (1.0 - smoothstep(0.26, 0.38, perPixel));
  }
`

const FRAGMENT = /* glsl */ `
  #include <color_fragment>
  #ifdef GRID_BODY
    // Gum near the teeth, a little denser; bone further down, dense enough that only about a fifth of a root shows
    // through it.
    diffuseColor.rgb = mix(diffuseColor.rgb, uDeep, smoothstep(1.5, 6.0, vGrid.z));
    diffuseColor.a *= mix(1.15, 1.1, smoothstep(0.8, 4.5, vGrid.z));
    // A slightly deeper collar along the gum line itself, wrapping each tooth's neck.
    float collar = 1.0 - smoothstep(0.15, 0.9, vGrid.z);
    diffuseColor.rgb = mix(diffuseColor.rgb, uDeep * 0.92, 0.35 * collar);
    diffuseColor.a = min(diffuseColor.a * (1.0 + 0.2 * collar), 0.86);
    float gridCover = max(gridLine(vGrid.x, uCell), gridLine(vGrid.y, uCell));
    vec3 line = uLine;
  #else
    // Lines around a tooth crowd toward its poles: keep every 2nd, 4th, 8th… as they do, cross-fading between.
    float level = clamp(-log2(max(vGrid.z, 0.01)), 0.0, 6.0);
    float lod = floor(level);
    float around = mix(gridLine(vGrid.x, uCell * exp2(lod)), gridLine(vGrid.x, uCell * exp2(lod + 1.0)), smoothstep(0.2, 0.8, level - lod));
    // Below the cementoenamel junction (v < 0) enamel gives way to the creamier cementum of the root, and the grid takes
    // the root's own darker shade, a little fainter.
    float rootSide = smoothstep(0.2, -1.4, vGrid.y) * uRootMix;
    diffuseColor.rgb = mix(diffuseColor.rgb, uRoot, rootSide);
    float gridCover = max(around, gridLine(vGrid.y, uCell)) * (1.0 - 0.3 * rootSide);
    vec3 line = mix(uLine, uRootLine, rootSide);
  #endif
  diffuseColor.rgb = mix(diffuseColor.rgb, uTint, uTintMix);
  diffuseColor.rgb = mix(diffuseColor.rgb, mix(line, uHover, uHighlight), gridCover * uGrid * mix(uLineMix, 1.0, uHighlight));
`

const DIM = /* glsl */ `
  #include <opaque_fragment>
  #ifdef GRID_BODY
    // Denser where the surface turns away from the eye, so the jaw's outline and the rounded gum line read.
    float facing = abs(dot(normalize(normal), normalize(vViewPosition)));
    gl_FragColor.a = min(gl_FragColor.a * mix(1.0, 1.35, pow(1.0 - facing, 2.0)), 0.88);
  #endif
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uBackdrop, uDim);
`

interface Options {
  colour: Color
  line: Color
  lineMix: number
  roughness: number
  opacity?: number
  body?: boolean
  deep?: Color
  root?: Color
  rootLine?: Color
  rootMix?: number
}

/** A shaded, gridded material. Each tooth gets its own (its uniforms change on their own); all share one program. */
export function gridMaterial(palette: Palette, shared: SharedUniforms, options: Options): GridMaterial {
  const translucent = options.opacity !== undefined && options.opacity < 1
  const material = new MeshStandardMaterial({
    color: options.colour,
    roughness: options.roughness,
    metalness: 0,
    side: FrontSide,
    transparent: translucent,
    opacity: options.opacity ?? 1,
    depthWrite: !translucent,
  }) as GridMaterial
  const grid: GridUniforms = {
    ...shared,
    uLine: { value: options.line.clone() },
    uLineMix: { value: options.lineMix },
    uHover: { value: palette.hover.clone() },
    uHighlight: { value: 0 },
    uTint: { value: palette.chosen.clone() },
    uTintMix: { value: 0 },
    uDim: { value: 0 },
    uDeep: { value: (options.deep ?? options.colour).clone() },
    uRoot: { value: (options.root ?? options.colour.clone().lerp(palette.gum, 0.6)).clone() },
    uRootLine: { value: (options.rootLine ?? options.line).clone() },
    uRootMix: { value: options.rootMix ?? 0 },
  }
  material.userData.grid = grid
  if (options.body) material.defines = { GRID_BODY: '' }
  material.customProgramCacheKey = () => (options.body ? 'enamel-grid-body' : 'enamel-grid')
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, grid)
    shader.vertexShader = shader.vertexShader.replace('#include <common>', VERTEX_PARS).replace('#include <begin_vertex>', VERTEX)
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', FRAGMENT_PARS).replace('#include <color_fragment>', FRAGMENT).replace('#include <opaque_fragment>', DIM)
  }
  return material
}

export const toothMaterial = (palette: Palette, shared: SharedUniforms) =>
  gridMaterial(palette, shared, { colour: palette.enamel, line: palette.enamelLine, root: palette.root, rootLine: palette.rootLine, lineMix: 0.8, roughness: 0.5, rootMix: 1 })

/** Gum: pink and mostly solid, so the roots show inside only faintly; a deeper pink further down. */
export const bodyMaterial = (palette: Palette, shared: SharedUniforms) =>
  gridMaterial(palette, shared, { colour: palette.gum, deep: palette.bone, line: palette.gumLine, lineMix: 0.62, roughness: 0.8, opacity: 0.72, body: true })

export type LayerKind = 'enamel' | 'dentin' | 'pulp'

/** The inside layers: a translucent enamel ghost, dentin (solid; tooth-view.ts makes it a ghost when the pulp shows) and the pulp and canals. */
export function layerMaterial(kind: LayerKind, palette: Palette, shared: SharedUniforms): GridMaterial {
  if (kind === 'pulp') return gridMaterial(palette, shared, { colour: palette.canal, line: palette.canal.clone().multiplyScalar(0.6), lineMix: 0.25, roughness: 0.6 })
  if (kind === 'dentin') return gridMaterial(palette, shared, { colour: palette.dentin, line: palette.dentin.clone().lerp(palette.grid, 0.5), lineMix: 0.45, roughness: 0.6 })
  return gridMaterial(palette, shared, { colour: palette.enamel, line: palette.enamelLine, lineMix: 0.6, roughness: 0.5, opacity: 0.2 })
}
