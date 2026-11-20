import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { BRACES, SERVICES, bracesPlan, checklistFor, durationLabel, hmoChecklist } from './services.ts'
import { peso } from './format.ts'

test('covered procedures list the LOA step', () => { assert.ok(hmoChecklist('filling').some((line) => line.includes('LOA'))) })

test('the price list matches the brief', () => {
  const prices = Object.fromEntries(SERVICES.map((s) => [s.id, s.from]))
  assert.deepEqual(prices, {
    checkup: 500, cleaning: 1000, fluoride: 600, xray: 400, panoramic: 1200,
    filling: 1200, 'root-canal-front': 8000, 'root-canal-molar': 12000, crown: 10000,
    extraction: 1000, wisdom: 6000,
    'braces-metal': 45000, 'braces-ceramic': 60000,
    whitening: 12000,
    'denture-partial': 8000, 'denture-full': 18000,
  })
})

test('every service says what is included, how long it takes and how HMOs treat it', () => {
  for (const s of SERVICES) {
    assert.ok(s.includes.length > 0, `${s.id} includes`)
    assert.ok(s.minutes > 0, `${s.id} minutes`)
    assert.ok(['often-covered', 'needs-loa', 'usually-not'].includes(s.coverage), `${s.id} coverage`)
  }
})

test('only braces go to the orthodontist', () => {
  assert.deepEqual(SERVICES.filter((s) => s.ortho).map((s) => s.id), ['braces-metal', 'braces-ceramic'])
})

test('durations read the way the price list writes them', () => {
  const label = (id: string) => durationLabel(SERVICES.find((s) => s.id === id)!)
  assert.equal(label('checkup'), '30 min'); assert.equal(label('wisdom'), '1 hour'); assert.equal(label('whitening'), '1.5 hours')
  assert.equal(label('root-canal-front'), '2 to 3 visits'); assert.equal(label('crown'), '2 visits')
})

test('treatments HMOs usually skip still say how to pay, and braces mention installments', () => {
  assert.ok(hmoChecklist('whitening').some((line) => line.includes('GCash')))
  assert.ok(hmoChecklist('braces-metal').some((line) => line.includes('₱9,000 down')))
  assert.ok(hmoChecklist('cleaning').some((line) => line.includes('valid ID')))
})

test('an unknown treatment has no checklist', () => { assert.deepEqual(hmoChecklist('teleport'), []) })

test('the checklist describes the clinic’s paperwork, not what insurers in general cover', () => {
  for (const s of SERVICES) {
    for (const line of hmoChecklist(s.id)) assert.doesNotMatch(line, /\bmost\b|\busually\b|\balways\b/i, `${s.id}: ${line}`)
  }
  assert.ok(hmoChecklist('whitening').some((line) => line.startsWith('Some plans')))
  assert.ok(hmoChecklist('checkup').some((line) => line.includes('The LOA tells us')))
})

test('the price list on the Treatments page matches SERVICES', () => {
  const html = readFileSync(new URL('../treatments/index.html', import.meta.url), 'utf8')
  const rows = [...html.matchAll(/<details class="disclosure" data-service="([^"]+)">([\s\S]*?)<\/details>/g)]
  assert.deepEqual(rows.map((r) => r[1]), SERVICES.map((s) => s.id))
  for (const [, id, row] of rows) {
    const s = SERVICES.find((x) => x.id === id)!
    assert.equal(row.match(/<summary[^>]*><span[^>]*>([^<]+)<\/span>/)?.[1], s.name, `${id} name`)
    assert.ok(row.includes(`</span> ${peso(s.from)}`), `${id} price`)
    for (const line of s.includes) assert.ok(row.includes(line), `${id} includes`)
  }
})

test('the braces plan adds up: the down payment plus the monthly amounts is the package price', () => {
  const metal = SERVICES.find((s) => s.id === 'braces-metal')!
  assert.equal(BRACES.down + BRACES.monthly * BRACES.months, metal.from)
  assert.equal(BRACES.total, metal.from)
  assert.equal(bracesPlan(), '₱9,000 down, then ₱1,500 a month for 24 months')
})

test('every place the braces plan is written uses the same numbers, from BRACES', () => {
  const pages = ['index.html', 'treatments/index.html', 'new-patients/index.html']
  for (const page of pages) {
    const html = readFileSync(new URL(`../${page}`, import.meta.url), 'utf8')
    assert.doesNotMatch(html, /18 to 24|18–24|₱10,000 down|Braces from ₱10,000/, `${page}: no old braces numbers`)
    for (const [, amount] of html.matchAll(/(₱[\d,]+) down/g)) assert.equal(amount, peso(BRACES.down), `${page}: down payment`)
    for (const [, amount] of html.matchAll(/(₱[\d,]+) (?:a month|at each monthly)/g)) assert.equal(amount, peso(BRACES.monthly), `${page}: monthly`)
    for (const [, months] of html.matchAll(/for (\d+) months/g)) assert.equal(Number(months), BRACES.months, `${page}: months`)
  }
  const treatments = readFileSync(new URL('../treatments/index.html', import.meta.url), 'utf8')
  assert.ok(treatments.includes(bracesPlan()), 'Treatments lists the plan')
  const home = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  assert.ok(home.includes(`${peso(BRACES.total)} package: ${bracesPlan()}`), 'Home states the package and the plan')
  assert.ok(hmoChecklist('braces-metal').some((line) => line.includes(bracesPlan())), 'the checklist repeats it')
})

test('the HMO checklist is only for a visit with an HMO', () => {
  assert.deepEqual(checklistFor('filling', ''), [])
  assert.deepEqual(checklistFor('filling', '   '), [])
  assert.deepEqual(checklistFor('filling', 'Sample HMO'), hmoChecklist('filling'))
  assert.deepEqual(checklistFor('teleport', 'Sample HMO'), [])
})
