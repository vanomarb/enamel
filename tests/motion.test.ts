import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const app = new URL('../app/', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, app), 'utf8')
const stylesheets = readdirSync(new URL('styles/', app)).filter((file) => file.endsWith('.css'))
const scripts = readdirSync(app, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))

/** Every transition, animation and smooth scroll must live inside @media (prefers-reduced-motion: no-preference). */
function unguardedMotion(css: string): string[] {
  const found: string[] = []
  let depth = 0
  let guardDepth: number | null = null
  for (const line of css.split('\n')) {
    if (line.includes('@media (prefers-reduced-motion: no-preference)')) guardDepth = depth
    if (/^\s*(transition|animation|scroll-behavior)\s*:/.test(line) && !(guardDepth !== null && depth > guardDepth)) found.push(line.trim())
    depth += (line.match(/{/g) ?? []).length - (line.match(/}/g) ?? []).length
    if (guardDepth !== null && depth <= guardDepth) guardDepth = null
  }
  return found
}

test('with reduced motion, nothing in the stylesheets moves', () => {
  assert.ok(stylesheets.includes('main.css'), 'reads the stylesheets in app/styles')
  for (const file of stylesheets) {
    assert.deepEqual(unguardedMotion(read(`styles/${file}`)), [], file)
  }
})

test('the guard catches motion outside the media query', () => {
  assert.deepEqual(unguardedMotion('.a {\n  transition: opacity 1s;\n}'), ['transition: opacity 1s;'])
  assert.deepEqual(unguardedMotion('@media (prefers-reduced-motion: no-preference) {\n  .a {\n    transition: opacity 1s;\n  }\n}'), [])
})

/** Class tokens from class="…" attributes (HTML and the scripts' template strings) and className assignments. */
function classTokens(source: string): string[] {
  const lists = [...source.matchAll(/class="([^"]*)"/g), ...source.matchAll(/className = '([^']*)'/g)].map((m) => m[1])
  return lists.flatMap((list) => list.split(/\s+/)).filter(Boolean)
}

/** Utilities that animate must sit behind Tailwind's motion-safe variant, the same guard the stylesheets use. */
const unguardedUtilities = (source: string) => classTokens(source).filter((token) => /(^|:)(transition|animate-)/.test(token) && !/(^|:)motion-safe:/.test(token))

test('with reduced motion, no utility in the markup moves', () => {
  const folders = readdirSync(app, { withFileTypes: true }).filter((e) => e.isDirectory() && readdirSync(new URL(`${e.name}/`, app)).includes('index.html'))
  const pages = ['index.html', '404.html', 'components/header.html', 'components/footer.html', 'components/tooth-explorer/tooth-explorer.html', ...folders.map((e) => `${e.name}/index.html`)]
  assert.ok(pages.length >= 14, 'finds every page')
  const sources = [...pages, ...scripts]
  const animated = sources.flatMap((file) => classTokens(read(file))).filter((token) => /(^|:)(transition|animate-)/.test(token))
  assert.ok(animated.length > 0, 'finds the animated utilities')
  for (const file of sources) assert.deepEqual(unguardedUtilities(read(file)), [], file)
})

test('the utility guard catches motion without motion-safe', () => {
  assert.deepEqual(unguardedUtilities('<div class="grid animate-panel-in hover:transition-colors"></div>'), ['animate-panel-in', 'hover:transition-colors'])
  assert.deepEqual(unguardedUtilities('<div class="motion-safe:open:animate-dialog-in motion-safe:transition-[border-color]"></div>'), [])
})

test('scrolling turns smooth in the guarded stylesheet only, never from a script', () => {
  // The one smooth scroll is CSS, and the first test above proves it sits inside the reduced-motion guard.
  assert.match(read('styles/main.css'), /scroll-behavior:\s*smooth/, 'the stylesheet is where smooth scrolling lives')
  assert.ok(scripts.length >= 8, 'finds the feature scripts')
  // A smooth scroll from script reads behavior: 'smooth'; GLSL's smoothstep() in a shader is not one.
  for (const file of scripts) assert.doesNotMatch(read(file), /behavior\s*:\s*['"]smooth['"]|scroll-behavior/, file)
})

test("the reveals hold nothing back before <html class=\"js\">, and never the page's first section", () => {
  const css = read('styles/main.css')
  const start = css.match(/@media \(prefers-reduced-motion: no-preference\) \{\s*([^{]+)\{\s*opacity: 0;\s*transform: translateY\(14px\);/)
  assert.ok(start, 'the hidden start state sits inside the reduced-motion guard')
  const selectors = start[1].split(',').map((selector) => selector.trim())
  assert.ok(selectors.length > 0)
  for (const selector of selectors) assert.match(selector, /^\.js :where\(main > [a-z]*:not\(:first-child\) .*\)$/, selector)
  const blocks = read('shared/reveal.ts').match(/const BLOCKS = '([^']+)'/)?.[1] ?? ''
  assert.ok(blocks, 'reveal.ts lists its blocks')
  for (const selector of blocks.split(',')) assert.match(selector.trim(), /^main > [a-z]*:not\(:first-child\) /, selector)
})
