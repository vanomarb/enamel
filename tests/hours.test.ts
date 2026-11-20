import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { DENTISTS, hoursText, lunchText } from '../app/lib/booking.ts'
import { includePartials } from '../build/partials.ts'
import { formatDay } from '../app/lib/dates.ts'
import { priceParts, priceWithUnit, serviceById } from '../app/lib/services.ts'
import { LOCAL_SITE_URL, assertNoPlaceholders, assertSiteUrl } from '../build/site-url.ts'

/* Pages may write the hours as static text; app/lib/booking.ts is the source they must agree with. */
const root = new URL('../app/', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), 'utf8')
const partials = { header: read('components/header.html'), footer: read('components/footer.html'), 'tooth-explorer': read('components/tooth-explorer/tooth-explorer.html') }
const folders = readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory() && existsSync(new URL(`${e.name}/index.html`, root)) && !['node_modules', 'dist'].includes(e.name)).map((e) => `${e.name}/index.html`)
const pages = ['index.html', ...folders].map((file) => [file, includePartials(read(file), partials)] as const)
const text = (html: string) => html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ')

test('every opening-hours range on every page is the data’s hours, and every lunch range is the data’s lunch', () => {
  let found = 0
  for (const [file, html] of pages) {
    const words = text(html)
    for (const [range] of words.matchAll(/\d{1,2}:\d{2} (?:AM|PM) to \d{1,2}:\d{2} (?:AM|PM)/g)) {
      found++
      assert.equal(range, hoursText(), `${file}: opening hours`)
    }
    for (const [range] of words.matchAll(/\d{1,2}:\d{2} to \d{1,2}:\d{2} (?:AM|PM)/g)) {
      found++
      assert.equal(range, lunchText(), `${file}: lunch`)
    }
  }
  assert.ok(found >= 8, 'the pages state the hours in several places')
})

test('"Monday to Saturday" and "Saturdays" on the pages match who works which days in the data', () => {
  const general = DENTISTS.filter((d) => d.id !== 'ortho')
  for (const d of general) assert.deepEqual(d.weekdays, [1, 2, 3, 4, 5, 6], `${d.id} works Monday to Saturday`)
  assert.deepEqual(DENTISTS.find((d) => d.id === 'ortho')?.weekdays, [6], 'the orthodontist works Saturdays only')
  for (const file of ['contact/index.html', 'about/index.html', 'book/index.html']) assert.ok(text(read(file)).includes('Monday to Saturday'), file)
  assert.ok(text(read('new-patients/index.html')).includes('On Saturdays only, from ' + hoursText()))
})

test('the team page’s week table has one row per dentist, and In or Not in for each day, exactly as the data says', () => {
  const html = read('team/index.html')
  const body = html.match(/<tbody[\s\S]*?<\/tbody>/)?.[0] ?? ''
  const rows = [...body.matchAll(/<tr[\s\S]*?<\/tr>/g)].map((m) => m[0])
  assert.equal(rows.length, DENTISTS.length)
  rows.forEach((row, i) => {
    const dentist = DENTISTS[i]
    assert.ok(text(row.match(/<th[\s\S]*?<\/th>/)![0]).trim().startsWith(dentist.role), `row ${i} is ${dentist.role}`)
    const cells = [...row.matchAll(/<td[\s\S]*?<\/td>/g)].map((m) => text(m[0]).trim())
    assert.equal(cells.length, 6, 'Monday to Saturday')
    cells.forEach((cell, day) => assert.equal(cell, dentist.weekdays.includes(day + 1) ? 'In' : 'Not in', `${dentist.id}, weekday ${day + 1}`))
  })
  const heads = [...html.matchAll(/<abbr title="(\w+)">(\w+)<\/abbr>/g)].map((m) => m[1])
  assert.deepEqual(heads, ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'])
})

test('Home’s who-is-in rows agree with the data', () => {
  const home = text(read('index.html'))
  assert.ok(home.includes('Monday to Friday Both general dentists'))
  assert.ok(home.includes('Saturday Both general dentists and the orthodontist'))
  assert.ok(home.includes('Sunday Closed'))
})

test('one date formatter: the day, with and without the year, the short weekday and the short date', () => {
  assert.equal(formatDay('2026-11-20'), 'Friday, November 20')
  assert.equal(formatDay('2026-11-20', 'long-year'), 'Friday, November 20, 2026')
  assert.equal(formatDay('2026-11-20', 'weekday'), 'Fri')
  assert.equal(formatDay('2026-11-20', 'month-day'), 'Nov 20')
})

test('one price-with-unit function: a unit follows the price, no unit is just the price', () => {
  assert.equal(priceWithUnit(serviceById('filling')!), '₱1,200 per surface')
  assert.equal(priceWithUnit(serviceById('checkup')!), '₱500')
  assert.deepEqual(priceParts(serviceById('crown')!), { amount: '₱10,000', unit: 'per tooth' })
})

test('the build guard refuses a missing or odd VITE_SITE_URL and a leftover placeholder', () => {
  assert.throws(() => assertSiteUrl(undefined), /VITE_SITE_URL is not set/)
  assert.throws(() => assertSiteUrl('  '), /VITE_SITE_URL is not set/)
  assert.throws(() => assertSiteUrl('example.com/enamel/'), /trailing slash|full address/)
  assert.throws(() => assertSiteUrl('https://example.com/enamel'), /trailing slash/)
  assert.doesNotThrow(() => assertSiteUrl('https://example.com/enamel/'))
  assert.throws(() => assertNoPlaceholders('index.html', '<link href="%VITE_SITE_URL%">'), /index\.html still contains %VITE_SITE_URL%/)
  assert.doesNotThrow(() => assertNoPlaceholders('index.html', '<link href="https://example.com/enamel/">'))
})

test('.env stays out of git, and .env.example shows the local site address', () => {
  const repo = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
  assert.match(repo('.gitignore'), /^\.env$/m, '.env is ignored')
  assert.ok(repo('.env.example').split('\n').includes(`VITE_SITE_URL=${LOCAL_SITE_URL}`), '.env.example names VITE_SITE_URL')
  assert.doesNotThrow(() => assertSiteUrl(LOCAL_SITE_URL))
})
