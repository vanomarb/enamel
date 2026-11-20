import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { ACCOUNT_KEY, APPOINTMENTS_KEY, firstWord, type Appointment } from '../app/lib/account.ts'
import { includePartials, withBase } from '../build/partials.ts'
import { peso } from '../app/lib/format.ts'
import { BRACES, COMMON_SERVICES, SERVICES, durationLabel } from '../app/lib/services.ts'

const root = new URL('../app/', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), 'utf8')

const PAGES = [
  { id: 'home', path: '' },
  { id: 'treatments', path: 'treatments/' },
  { id: 'new-patients', path: 'new-patients/' },
  { id: 'team', path: 'team/' },
  { id: 'book', path: 'book/' },
  { id: 'account', path: 'account/' },
  { id: 'about', path: 'about/' },
  { id: 'contact', path: 'contact/' },
  { id: 'terms', path: 'terms/' },
  { id: 'privacy', path: 'privacy/' },
  { id: 'cookies', path: 'cookies/' },
  { id: 'accessibility', path: 'accessibility/' },
] as const
type PageId = (typeof PAGES)[number]['id']

/* The partials and 404.html write links as %BASE_URL%…; the tests read them as the build leaves them. */
const BASE = '/enamel/'
const rawPartials = { header: read('components/header.html'), footer: read('components/footer.html'), 'tooth-explorer': read('components/tooth-explorer/tooth-explorer.html') }
const partials = { header: withBase(rawPartials.header, BASE), footer: withBase(rawPartials.footer, BASE), 'tooth-explorer': withBase(rawPartials['tooth-explorer'], BASE) }
const source = Object.fromEntries(PAGES.map((page) => [page.id, read(`${page.path}index.html`)])) as Record<PageId, string>
const built = Object.fromEntries(PAGES.map((page) => [page.id, includePartials(source[page.id], rawPartials)])) as Record<PageId, string>
const rawNotFound = read('404.html')
const notFound = withBase(rawNotFound, BASE)

const count = (html: string, text: string) => html.split(text).length - 1
const meta = (html: string, attribute: 'name' | 'property', key: string) => html.match(new RegExp(`<meta ${attribute}="${key}" content="([^"]*)"`))?.[1]
const mainOf = (html: string) => html.match(/<main id="main">([\s\S]*?)<\/main>/)?.[1] ?? ''
const DISCLOSURE = 'Enamel is a concept brand. This is a demonstration site: nothing you enter here is sent, and no payments are taken.'
const ABOUT_LINK = /<button [^>]*data-concept[^>]*>About this site<\/button>/

/** Every file the product is built from (not the README, which may credit the author). */
function productSources(): [string, string][] {
  const files: [string, string][] = [...PAGES.map((p) => [`${p.path}index.html`, source[p.id]] as [string, string]), ['404.html', notFound], ['components/header.html', partials.header], ['components/footer.html', partials.footer], ['components/tooth-explorer/tooth-explorer.html', partials['tooth-explorer']]]
  const walk = (dir: string) => {
    for (const entry of readdirSync(new URL(dir, root), { withFileTypes: true })) {
      const path = `${dir}${entry.name}`
      if (entry.isDirectory()) walk(`${path}/`)
      else if (!path.endsWith('.test.ts') && !path.endsWith('.html')) files.push([path, read(path)])
    }
  }
  walk('')
  walk('../build/')
  return files
}

test('the pages on disk are exactly the pages the site lists', () => {
  const folders = readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(new URL(`${e.name}/index.html`, root)))
    .map((e) => `${e.name}/`)
  assert.deepEqual(folders.sort(), PAGES.filter((p) => p.path).map((p) => p.path).sort())
})

test('every page has its own title, description and canonical, and stays out of search', () => {
  const titles = new Set<string>()
  const descriptions = new Set<string>()
  for (const page of PAGES) {
    const html = source[page.id]
    const url = `%VITE_SITE_URL%${page.path}`
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1]
    const description = meta(html, 'name', 'description')
    assert.ok(title && title.length <= 60, `${page.id}: title`)
    assert.ok(description && description.length <= 160, `${page.id}: description`)
    titles.add(title)
    descriptions.add(description)
    assert.ok(html.includes(`<link rel="canonical" href="${url}" />`), `${page.id}: canonical`)
    assert.equal(meta(html, 'name', 'robots'), 'noindex', `${page.id}: noindex`)
    assert.equal(meta(html, 'property', 'og:title'), title, `${page.id}: og:title`)
    assert.equal(meta(html, 'property', 'og:description'), description, `${page.id}: og:description`)
    assert.equal(meta(html, 'property', 'og:url'), url, `${page.id}: og:url`)
    assert.equal(meta(html, 'property', 'og:image'), '%VITE_SITE_URL%og.png', `${page.id}: og:image`)
    assert.equal(meta(html, 'name', 'twitter:card'), 'summary_large_image', `${page.id}: twitter card`)
    assert.ok(html.includes('<script type="module" src="/main.ts"></script>'), `${page.id}: script`)
  }
  assert.equal(titles.size, PAGES.length, 'titles are unique')
  assert.equal(descriptions.size, PAGES.length, 'descriptions are unique')
})

test('every page takes the shared header and footer, and exactly its own link is marked current', () => {
  for (const page of PAGES) {
    assert.equal(count(source[page.id], '<!-- include:header'), 1, `${page.id}: header marker`)
    assert.equal(count(source[page.id], '<!-- include:footer'), 1, `${page.id}: footer marker`)
    assert.doesNotMatch(source[page.id], /<header[\s>]|<footer[\s>]/, `${page.id}: no copied header or footer`)
    const html = built[page.id]
    assert.doesNotMatch(html, /<!-- include:/, `${page.id}: markers replaced`)
    // The phone drawer repeats the header links, so a header page is marked in both lists; never another page.
    const current = [...html.matchAll(/<a [^>]*data-page="([a-z-]+)" aria-current="page"/g)].map((m) => m[1])
    assert.deepEqual([...new Set(current)], [page.id], `${page.id}: only its own link is current`)
    assert.equal(count(html, `data-page="${page.id}"`), count(html, `data-page="${page.id}" aria-current="page"`), `${page.id}: every copy of its link is current`)
    assert.equal(count(html, '<main id="main"'), 1, `${page.id}: main`)
    assert.equal(count(html, '<h1'), 1, `${page.id}: one h1`)
    assert.match(html, ABOUT_LINK, `${page.id}: About this site link`)
    assert.ok(html.includes('id="concept-dialog"'), `${page.id}: About this site dialog`)
  }
})

test('the header reaches the main pages and the footer reaches the rest', () => {
  for (const id of ['home', 'treatments', 'new-patients', 'team', 'account', 'book']) {
    const page = PAGES.find((p) => p.id === id)!
    assert.match(partials.header, new RegExp(`href="/enamel/${page.path}"[^>]*data-page="${id}"`), `header: ${id}`)
  }
  for (const id of ['about', 'contact', 'accessibility', 'terms', 'privacy', 'cookies']) {
    assert.match(partials.footer, new RegExp(`href="/enamel/${id}/"[^>]*data-page="${id}"`), `footer: ${id}`)
  }
  assert.ok(partials.footer.includes('href="/enamel/new-patients/#faq"'), 'footer: FAQ')
  assert.ok(partials.footer.includes('© 2026 Enamel'), 'footer: copyright')
  assert.match(partials.footer, /<form [^>]*data-mock-form="newsletter"/, 'footer: newsletter')
})

test('the footer is a clinic card: hours and Book a visit on one side, the links and the newsletter on the other', () => {
  const footer = partials.footer.slice(0, partials.footer.indexOf('<dialog'))
  for (const heading of ['Company', 'Help', 'Legal', 'Newsletter']) assert.ok(!footer.includes(`>${heading}</h2>`), `no "${heading}" column`)
  const front = footer.match(/<div class="[^"]*" data-clinic-card-front>([\s\S]*?)<\/div>\s*<div class="[^"]*" data-clinic-card-back>/)?.[1]
  assert.ok(front, 'the card has a front and a back')
  for (const line of ['Monday to Saturday', '9:00 AM to 6:00 PM', 'Sunday', 'Closed', 'Saturdays']) assert.ok(front.includes(line), `front: ${line}`)
  assert.match(front, /<a class="button[^"]*" href="\/enamel\/book\/">Book a visit<\/a>/, 'front: Book a visit')
  const back = footer.slice(footer.indexOf('data-clinic-card-back'))
  assert.ok(back.indexOf('<nav') < back.indexOf('data-mock-form="newsletter"'), 'back: the links, then the newsletter')
  for (const href of ['/enamel/about/', '/enamel/contact/', '/enamel/new-patients/#faq']) assert.ok(back.includes(`href="${href}"`) && !front.includes(`href="${href}"`), `back: ${href}`)
  // "About this site" is one of the links about the website, not a tag on the copyright line.
  const siteLinks = footer.match(/<nav aria-labelledby="footer-site">([\s\S]*?)<\/nav>/)?.[1] ?? ''
  assert.match(siteLinks, ABOUT_LINK, 'About this site sits with the website’s own links')
  for (const id of ['terms', 'privacy', 'cookies', 'accessibility']) assert.ok(siteLinks.includes(`href="/enamel/${id}/"`), `website links: ${id}`)
  const copyright = footer.match(/<p [^>]*>© 2026 Enamel<\/p>/)
  assert.ok(copyright, 'the copyright line stands alone')
  assert.doesNotMatch(footer.slice(footer.indexOf('© 2026 Enamel')), /data-concept/, 'nothing follows the copyright line')
})

test('the phone menu is a drawer from the right: a modal dialog with a labelled close, today’s hours and Book a visit', () => {
  const header = partials.header
  const button = header.match(/<button [^>]*data-menu-button[^>]*>([\s\S]*?)<\/button>/)
  assert.ok(button, 'the Menu button')
  assert.match(button[0], /aria-expanded="false"/)
  assert.match(button[0], /aria-controls="site-menu"/)
  assert.match(button[0], /lg:hidden/, 'only below 860 px, as before')
  assert.match(button[0], /size-11/, 'a 44 px square, icon only')
  assert.match(button[1], /<span class="sr-only">Menu<\/span>/, 'keeps its name, Menu, for screen readers')
  assert.match(button[1], /data-icon="list"[^>]*group-aria-expanded:hidden/, 'list icon while closed')
  assert.match(button[1], /data-icon="x"[^>]*group-aria-expanded:block/, 'x icon while open')
  assert.ok(header.indexOf('href="/enamel/"') < header.indexOf('>Book a visit</a>') && header.indexOf('>Book a visit</a>') < header.indexOf('data-menu-button'), 'wordmark, Book a visit, Menu')
  const drawer = header.match(/<dialog [^>]*id="site-menu"[^>]*>[\s\S]*?<\/dialog>/)?.[0]
  assert.ok(drawer, 'the menu is a <dialog>')
  const open = drawer.slice(0, drawer.indexOf('>'))
  assert.match(open, /aria-label="Menu"/, 'the dialog is named')
  assert.match(open, /right-0/, 'pinned to the right')
  assert.match(open, /w-\[min\(22rem,86vw\)\]/, 'about min(22rem, 86vw) wide')
  assert.match(open, /backdrop:bg-spruce-deep\/50/, 'over a scrim')
  assert.match(open, /motion-safe:open:animate-drawer-in/, 'slides in only with motion welcome')
  assert.match(drawer, /<button [^>]*data-menu-close[^>]*>[\s\S]*?<span class="sr-only">Close menu<\/span><\/button>/, 'an icon-only close button named Close menu')
  // The close x lines up with the menu icon: both buttons sit 0.75rem out past the page gutter.
  assert.match(button[0], /-mr-3/, 'the menu icon sits 0.75rem into the gutter')
  assert.match(drawer, /<button class="mr-\[calc\(var\(--spacing-gutter\)-2\.25rem\)\][^"]*"[^>]*data-menu-close/, 'the close x at the same inset (1.5rem padding + 0.75rem)')
  const logo = header.match(/<a class="([^"]*)" href="\/enamel\/" data-page="home">([\s\S]*?)<\/a>/)
  assert.ok(logo, 'the wordmark')
  assert.match(logo[2], /<span class="max-sm:sr-only">Enamel<\/span>/, 'below 600 px only the mark shows; the name stays for screen readers')
  assert.match(logo[1], /max-sm:min-w-11/, 'the mark alone is still a 44 px target')
  assert.match(logo[2], /<svg class="[^"]*sm:-top-\[0\.18em\]/, 'beside the name, the arch stands on its baseline')
  for (const id of ['treatments', 'new-patients', 'team', 'account']) {
    assert.match(drawer, new RegExp(`<a class="[^"]*font-display[^"]*" href="/enamel/${id}/" data-page="${id}"`), `serif link: ${id}`)
  }
  assert.ok(drawer.includes('data-today-hours'), 'today’s hours')
  assert.ok(drawer.indexOf('data-today-hours') < drawer.lastIndexOf('>Book a visit</a>'), 'Book a visit at the bottom')
  assert.doesNotMatch(header, /peer-aria-expanded/, 'no drop-down list left behind')
  const nav = read('shared/nav.ts')
  assert.match(nav, /\.showModal\(\)/, 'opened as a modal: focus moves in and stays, Escape closes')
  assert.match(nav, /event\.target === menu/, 'a tap on the scrim closes')
  assert.match(nav, /button\.focus\(\)/, 'focus returns to Menu')
  assert.match(read('styles/main.css'), /html:has\(#site-menu\[open\]\) \{\s*overflow: hidden;/, 'the page behind does not scroll')
})

test('an include for a page the partials do not know fails the build', () => {
  assert.throws(() => includePartials('<!-- include:header current="pricing" -->', partials), /pricing/)
})

test('the build marks every copy of the current link and puts the shared explorer in', () => {
  const html = includePartials('<!-- include:header current="team" --><!-- include:tooth-explorer -->', { header: '<a data-page="team">1</a><a data-page="team">2</a>', footer: '', 'tooth-explorer': '<div data-tooth-explorer></div>' })
  assert.equal(html, '<a data-page="team" aria-current="page">1</a><a data-page="team" aria-current="page">2</a><div data-tooth-explorer></div>')
})

test('the product never names its author, and no link leaves for a portfolio, GitHub, a phone or an inbox', () => {
  for (const [file, text] of productSources()) {
    assert.doesNotMatch(text, /van omar|designed and built|portfolio|github/i, file)
    assert.doesNotMatch(text, /href="(?:tel|mailto):/i, file)
  }
})

test('the footer keeps a small About this site link; the statement lives in its dialog and on the Terms page', () => {
  const footer = partials.footer.slice(0, partials.footer.indexOf('<dialog'))
  assert.match(footer, ABOUT_LINK, 'About this site in the footer')
  assert.ok(!footer.includes(DISCLOSURE) && !/concept (?:brand|clinic)|demonstration/i.test(footer), 'no disclosure line in the footer')
  assert.ok(partials.footer.includes('About this site</h2>') && partials.footer.includes(`<p id="concept-text">${DISCLOSURE}</p>`), 'the dialog states it')
  assert.ok(mainOf(built.terms).includes(DISCLOSURE), 'Terms states it')
  assert.ok(!source['new-patients'].includes('Is this a real business?'), 'no "real business" FAQ')
})

test('signed in, the header shows the first word of the name from the first paint, never "My account"', () => {
  assert.ok(!partials.header.includes('My account'))
  assert.match(partials.header, /<span [^>]*after:content-\(--account-name\)[^>]*><\/span>/, 'the name label reads --account-name')
  const script = partials.header.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? ''
  assert.match(script, /setAttribute\('data-signed-in'/, 'sets the signed-in state before the header')
  assert.match(script, /--account-name/, 'sets the name before the header')
  assert.match(script, /classList\.add\('js'\)/, 'marks <html class="js"> for the reveals')
  assert.match(script, /data-reveal-ready[\s\S]*classList\.remove\('js'\)/, 'shows everything if the reveal script never starts')
  assert.ok(partials.header.indexOf('<script>') < partials.header.indexOf('<header'), 'runs before the header is drawn')
})

test("the header script's first-word rule gives the same name as firstWord() in app/lib/account.ts", () => {
  const script = partials.header.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? ''
  const source = script.match(/const firstWord = (\(name\) => [^\n]+)/)?.[1]
  assert.ok(source, 'the script names its rule firstWord, on one line')
  assert.match(script, /firstWord\(JSON\.parse\(localStorage\.getItem\('enamel\.account'\)/, 'and uses it for the stored name')
  const inline = new Function(`return ${source}`)() as (name: string) => string
  const cases = ['Ana Cruz', '  ana  ', 'María José', '', 'A'.repeat(40), '🦷 Ana', '😀Ana Cruz', `${'a'.repeat(15)}😀z`, '"Ana" Cruz', '<b>Ana</b>', '...Ana', '¡Hola! Ana', '\\Ana']
  for (const name of cases) {
    const expected = firstWord(name)
    assert.equal(inline(name), expected, JSON.stringify(name))
    assert.ok([...expected].length <= 16, `${JSON.stringify(name)}: at most 16 characters`)
    assert.doesNotMatch(expected, /["\\<>]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])/, `${JSON.stringify(name)}: safe in a CSS string, no half emoji`)
  }
})

test('sign-in speaks like the clinic’s front desk, in two steps where the first can be changed', () => {
  for (const [file, text] of productSources()) assert.doesNotMatch(text, /Use a different email or number|Get a one-time code/, file)
  const account = mainOf(source.account)
  const steps = account.match(/<ol [^>]*data-signin-steps>([\s\S]*?)<\/ol>/)?.[1]
  assert.ok(steps, 'the sign-in is a stepper')
  assert.equal(count(steps, '<li class="step '), 2, 'two steps: who you are, then the code')
  assert.ok(steps.indexOf('data-signin="contact"') < steps.indexOf('data-signin="code"'), 'contact step first')
  assert.match(steps, /<button [^>]*data-signin-back[^>]*>Change<span class="sr-only">[^<]+<\/span><\/button>/, 'the first step is changed with "Change", as in the booking')
  assert.match(steps, />Your name and contact<\/h2>/)
  assert.match(steps, />Your code<\/h2>/)
  assert.match(steps, /<button class="button[^"]*" type="submit">Show my code<\/button>/)
  assert.match(steps, /An email address, or a mobile number that starts with 09\./, 'the contact hint')
  assert.doesNotMatch(account, /\b09\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/, 'no example number that could be someone’s')
  assert.doesNotMatch(account, /xl:grid-cols-split/, 'not the intro-beside-the-form pairing any more')
  assert.match(account, /data-account-name/, 'the greeting names the patient')
  assert.match(account, /nothing (?:you type )?leaves your browser/, 'says plainly that nothing is sent')
})

test('there is no password field anywhere, only an email or mobile number and an on-screen code', () => {
  for (const [file, text] of productSources()) assert.doesNotMatch(text, /type="password"|type=\\"password\\"/, file)
  const account = mainOf(source.account)
  assert.ok(account.includes('data-account'), 'account feature')
  assert.match(account, /<input [^>]*name="contact"/, 'email or mobile number')
  assert.match(account, /<input [^>]*name="first-name"/, 'first name')
  assert.match(account, /<input [^>]*autocomplete="one-time-code"/, 'one-time code')
})

test('signed in, the account greeting row keeps its height before the script fills it', () => {
  // The contact line is empty until account.ts fills it; without a reserved line the greeting would move up ~10 px.
  assert.match(mainOf(source.account), /<p class="[^"]*min-h-\[1lh\][^"]*" data-account-contact><\/p>/)
})

test('the tooth explorer is on Home and Treatments, from one partial; the price list only on Treatments, the booking only on Book', () => {
  for (const page of PAGES) {
    const explorer = page.id === 'home' || page.id === 'treatments'
    assert.equal(source[page.id].includes('<!-- include:tooth-explorer -->'), explorer, `${page.id}: explorer include`)
    assert.equal(count(mainOf(built[page.id]), 'data-tooth-explorer'), explorer ? 1 : 0, `${page.id}: explorer`)
    assert.ok(!mainOf(source[page.id]).includes('data-tooth-explorer'), `${page.id}: no copied explorer markup`)
    assert.equal(source[page.id].includes('data-services'), page.id === 'treatments', `${page.id}: price list`)
    assert.equal(source[page.id].includes('data-booking'), page.id === 'book', `${page.id}: booking`)
  }
  // Without JavaScript the explorer's list fallback shows wherever the explorer is.
  for (const id of ['home', 'treatments'] as const) {
    const noscript = source[id].match(/<noscript>([\s\S]*?)<\/noscript>/)?.[1] ?? ''
    assert.ok(noscript.includes('[data-js-only] { display: none; }') && noscript.includes('[data-no-js] { display: grid; }'), `${id}: explorer fallback`)
  }
})

test('Home opens with Book a visit and a price card drawn from SERVICES, then the tooth chart', () => {
  const home = mainOf(source.home)
  const hero = home.match(/<section [^>]*id="top"[^>]*>([\s\S]*?)<\/section>/)?.[1] ?? ''
  assert.match(hero, /<h1 /, 'the opening holds the headline')
  assert.match(hero, /<a class="button button--primary button--large[^"]*" href="\/enamel\/book\/">Book a visit<\/a>/, 'Book a visit')
  const card = hero.match(/<ul [^>]*data-price-card>([\s\S]*?)<\/ul>/)?.[1]
  assert.ok(card, 'the price card')
  const rows = [...card.matchAll(/<a [^>]*href="\/enamel\/book\/\?service=([a-z-]+)"[^>]*>([\s\S]*?)<\/a>/g)]
  assert.deepEqual(rows.map((r) => r[1]), [...COMMON_SERVICES], 'the common treatments, in order, each booking itself')
  for (const [, id, row] of rows) {
    const s = SERVICES.find((x) => x.id === id)!
    assert.ok(row.includes(`>${s.name}</span>`), `${id}: name`)
    assert.ok(row.includes(`>${peso(s.from)}${s.unit ? ` <span class="font-text text-sm text-sage">${s.unit}</span>` : ''}</span>`), `${id}: starting price ${peso(s.from)}`)
    assert.ok(row.includes(`>${durationLabel(s)}</span>`), `${id}: time in the chair`)
  }
  assert.ok(hero.includes('href="/enamel/treatments/"'), 'the card leads on to every price')
  const order = ['id="top"', 'id="chart"', 'id="braces"', 'id="hours"', 'id="visit"'].map((id) => home.indexOf(id))
  assert.ok(order.every((at, i) => at >= 0 && (i === 0 || at > order[i - 1])), `sections in order: ${order}`)
  const chart = home.match(/<section [^>]*id="chart"[^>]*>([\s\S]*?)<\/section>/)?.[1] ?? ''
  assert.ok(chart.includes('<!-- include:tooth-explorer -->'), 'the chart is the Treatments explorer, included')
})

test('Home has no benefits row, no numbered first-visit steps and no account band', () => {
  const home = mainOf(source.home)
  assert.doesNotMatch(home, /A clinic that tells you first|id="why"|visit-step|How a first visit works|id="first-visit"/, 'no benefits or "How" section')
  assert.doesNotMatch(home, /Your appointments, in one place|id="appointments"|href="\/enamel\/account\/"/, 'no account band')
  assert.doesNotMatch(home, /<ol[\s>]/, 'no numbered sequence')
  assert.doesNotMatch(home, /<form /, 'the closing card books; the newsletter lives in the footer alone')
  assert.doesNotMatch(home, /\b\d[\d,]* (?:happy |satisfied )?(?:patients|families|reviews)\b|★|stars?\b|award/i, 'no invented proof')
})

test('Home keeps the braces band, merges the dentists and the hours, and closes on one Book your visit button', () => {
  const home = mainOf(source.home)
  assert.ok(home.includes('href="/enamel/book/?service=braces-metal"') && home.includes(peso(BRACES.down)) && home.includes(peso(BRACES.monthly)), 'braces promotion in real prices')
  const hours = home.match(/<section [^>]*id="hours"[^>]*>([\s\S]*?)<\/section>/)?.[1] ?? ''
  for (const line of ['9:00 AM to 6:00 PM', 'Monday to Friday', 'Saturday', 'Sunday', 'general dentists', 'orthodontist']) assert.ok(hours.includes(line), `who is in and when: ${line}`)
  assert.ok(hours.includes('href="/enamel/team/"'), 'leads on to Dentists and hours')
  const visit = home.match(/<section [^>]*id="visit"[^>]*>([\s\S]*?)<\/section>/)?.[1] ?? ''
  assert.ok(visit.includes('Book your visit this week'), 'the closing card')
  assert.equal(count(visit, 'class="button'), 1, 'one button')
  assert.match(visit, /class="button button--primary button--large" href="\/enamel\/book\/">Book your visit<\/a>/)
  assert.ok(visit.includes('href="/enamel/new-patients/"'), 'first-timers are pointed to New patients')
  assert.ok(home.includes(peso(500)) && home.includes('href="/enamel/book/?service=checkup"'), 'the ₱500 check-up')
})

test('the action pages carry the concept note beside their main action, each in its own words', () => {
  // Home's note sits beside "Book a visit", in the clinic's voice.
  const hero = mainOf(built.home).match(/<section [^>]*id="top"[^>]*>([\s\S]*?)<\/section>/)?.[1] ?? ''
  const action = hero.match(/<div class="[^"]*" data-hero-action>([\s\S]*?)<\/div>/)?.[1] ?? ''
  assert.match(action, />Book a visit<\/a>/, 'beside the main action')
  assert.match(action, /Enamel is a concept clinic[^<]*<button [^>]*data-concept>About this site<\/button>/, 'home: concept note')
  assert.match(mainOf(built.book), /Enamel is a concept brand[^<]*<button [^>]*data-concept>About this site<\/button>/, 'book: concept note')
})

test('the legal pages read like a Philippine clinic’s and match what the site stores', () => {
  const privacy = mainOf(source.privacy)
  assert.ok(privacy.includes('Data Privacy Act of 2012') && privacy.includes('10173'), 'Data Privacy Act')
  assert.ok(privacy.includes('National Privacy Commission'), 'NPC')
  const cookies = mainOf(source.cookies)
  for (const key of [ACCOUNT_KEY, APPOINTMENTS_KEY]) assert.ok(cookies.includes(key), `cookie policy lists ${key}`)
  // Every field of a stored appointment is named in plain words on both pages, the HMO provider included.
  const stored: Record<keyof Appointment, RegExp | null> = {
    id: null,
    serviceId: /treatment/i,
    dentistId: /dentist/i,
    day: /\bday\b/i,
    start: /\btime\b/i,
    patient: /patient name/i,
    hmo: /HMO provider/i,
  }
  for (const [field, words] of Object.entries(stored)) {
    if (words) for (const [page, text] of [['cookies', cookies], ['privacy', privacy]]) assert.match(text, words, `${page} says the appointment keeps its ${field}`)
  }
  assert.deepEqual(Object.keys(stored).sort(), Object.keys(sampleAppointment).sort(), 'the list above covers every stored field')
  for (const id of ['terms', 'privacy', 'cookies', 'accessibility'] as const) assert.match(mainOf(source[id]), /demonstration site/, `${id}: demonstration`)
  assert.match(mainOf(source.contact), /<form [^>]*data-mock-form="contact"/, 'contact form')
})

test('each section lives on its page', () => {
  for (const id of ['first-visit', 'hmo', 'faq']) assert.ok(source['new-patients'].includes(`id="${id}"`), `New patients: ${id}`)
  assert.ok(source.team.includes('role="table"'), 'Team: the weekly schedule')
  assert.ok(source.treatments.includes('id="teeth"'), 'Treatments: the tooth explorer section')
  assert.ok(source.home.includes('id="chart"'), 'Home: the tooth chart section')
})

test('without JavaScript, every page keeps the header in the flow and the menu links inline', () => {
  for (const [id, html] of [...PAGES.map((p) => [p.id, source[p.id]]), ['404', notFound]]) {
    const noscript = html.match(/<noscript>([\s\S]*?)<\/noscript>/)?.[1] ?? ''
    assert.ok(noscript.includes('[data-header] { position: sticky; }'), `${id}: sticky header`)
    assert.ok(noscript.includes('[data-menu] { position: static;'), `${id}: inline menu links`)
  }
})

test('the 404 takes the shared header and footer and points to every main page', () => {
  const html = includePartials(notFound, partials)
  assert.equal(count(notFound, '<!-- include:header -->'), 1, 'header marker, no current page')
  assert.equal(count(notFound, '<!-- include:footer -->'), 1, 'footer marker')
  assert.doesNotMatch(html, /data-page="[a-z-]+" aria-current="page"/, 'no link is current')
  assert.match(html, ABOUT_LINK, 'About this site link')
  assert.ok(html.includes('id="concept-dialog"'), 'dialog')
  assert.ok(notFound.includes('<script type="module" src="/main.ts"></script>'), 'script, so the dialog opens')
  assert.equal(meta(notFound, 'name', 'robots'), 'noindex')
  assert.ok(!notFound.includes('rel="canonical"'), 'no canonical on a 404')
  assert.equal(meta(notFound, 'property', 'og:title'), notFound.match(/<title>([^<]+)<\/title>/)?.[1])
  assert.equal(meta(notFound, 'property', 'og:description'), meta(notFound, 'name', 'description'))
  for (const key of ['og:image', 'og:image:width', 'og:image:height', 'og:image:alt']) assert.ok(meta(notFound, 'property', key), key)
  for (const id of ['home', 'treatments', 'new-patients', 'team', 'book']) {
    const page = PAGES.find((p) => p.id === id)!
    assert.ok(notFound.includes(`href="/enamel/${page.path}"`), `links to ${id}`)
  }
  assert.equal(count(html, '<h1'), 1, 'one h1')
})

test('button rows never take a different number of rows when the web font arrives', () => {
  const css = read('styles/main.css')
  const rule = css.match(/\.button-row \{([^}]*)\}\s*@media \(width >= 30rem\) \{\s*\.button-row \{([^}]*)\}/)
  assert.ok(rule, '.button-row is one column below 30rem and a row from 30rem')
  assert.match(rule[1], /display: grid/)
  assert.match(rule[2], /display: flex/)
  // Home's main action is one button with the concept note beside it: stacked below 37.5rem, a row from there.
  assert.match(mainOf(source.home), /<div class="[^"]*\bgrid\b[^"]*\bsm:flex\b[^"]*" data-hero-action>/, 'hero action')
  assert.match(partials.footer, /<div class="button-row gap-2">\s*<input /, 'footer newsletter field and button')
  const account = read('account/account.ts')
  assert.match(account, /<div class="button-row" data-appointment-actions>/, 'Reschedule and Cancel')
  assert.match(account, /<div class="button-row"><button type="button" class="button button--primary button--small" data-cancel-yes/, 'the cancel confirm')
  // The greeting and its two buttons stack below 37.5rem and share one row from there, by breakpoint, not by wrapping.
  assert.match(mainOf(source.account), /<div class="grid gap-3 [^"]*\bsm:flex\b[^"]*">\s*<div class="min-w-0 sm:flex-1">/, 'greeting row')
  assert.match(mainOf(source.treatments), /<fieldset class="flex min-w-0 flex-nowrap [^"]*overflow-x-auto/, 'chips in one scrolling row')
})

/** Selector specificity as [ids, classes/attributes/pseudo-classes, types]: :where() counts nothing, :not(), :is() and
 *  :has() count their most specific argument. Enough for the selectors this site writes. */
function specificity(selector: string): [number, number, number] {
  const add = (a: number[], b: number[]) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
  const max = (list: number[][]) => list.reduce((m, s) => (s[0] - m[0] || s[1] - m[1] || s[2] - m[2]) > 0 ? s : m, [0, 0, 0])
  const splitTop = (text: string) => {
    const parts: string[] = []
    let depth = 0
    let current = ''
    for (const ch of text) {
      if (ch === '(') depth++
      if (ch === ')') depth--
      if (ch === ',' && depth === 0) {
        parts.push(current)
        current = ''
      } else current += ch
    }
    return [...parts, current].map((s) => s.trim()).filter(Boolean)
  }
  let total = [0, 0, 0]
  let rest = selector
  while (rest.length) {
    const fn = rest.match(/^:(where|not|is|has)\(/)
    if (fn) {
      let depth = 1
      let i = fn[0].length
      for (; i < rest.length && depth; i++) depth += rest[i] === '(' ? 1 : rest[i] === ')' ? -1 : 0
      const inner = rest.slice(fn[0].length, i - 1)
      if (fn[1] !== 'where') total = add(total, max(splitTop(inner).map(specificity)))
      rest = rest.slice(i)
      continue
    }
    const token = rest.match(/^(#[\w-]+|\.[\w-]+|\[[^\]]*\]|::[\w-]+|:[\w-]+(\([^)]*\))?|[a-z][\w-]*|\*|[\s>+~]+)/i)
    assert.ok(token, `can read ${JSON.stringify(rest)}`)
    const t = token[0]
    if (t.startsWith('#')) total = add(total, [1, 0, 0])
    else if (t.startsWith('.') || t.startsWith('[') || (t.startsWith(':') && !t.startsWith('::'))) total = add(total, [0, 1, 0])
    else if (t.startsWith('::') || /^[a-z]/i.test(t)) total = add(total, [0, 0, 1])
    rest = rest.slice(t.length)
  }
  return total as [number, number, number]
}

test('the selector specificity helper counts what the browser counts', () => {
  assert.deepEqual(specificity('.js main > section:not(:first-child) > div > *'), [0, 2, 3])
  assert.deepEqual(specificity('.js .is-revealed'), [0, 2, 0])
  assert.deepEqual(specificity('.js :where(main > section > div) > *'), [0, 1, 0])
  assert.deepEqual(specificity('#a [data-x] p::before'), [1, 1, 2])
})

test('a revealed block always beats its hidden start state, so nothing stays invisible after it reveals', () => {
  const css = read('styles/main.css')
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m, index) => ({ index, selectors: m[1].split(',').map((s) => s.trim()).filter(Boolean), body: m[2] }))
  const hidden = rules.filter((r) => /opacity:\s*0;/.test(r.body) && /translateY\(14px\)/.test(r.body))
  const revealed = rules.filter((r) => r.selectors.some((s) => s.includes('.is-revealed')) && /opacity:\s*1;/.test(r.body))
  assert.ok(hidden.length > 0 && revealed.length > 0, 'finds the hidden and the revealed reveal rules')
  const cmp = (a: number[], b: number[]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
  for (const rule of hidden) {
    for (const selector of rule.selectors) {
      const winner = revealed.flatMap((r) => r.selectors.filter((s) => s.includes('.is-revealed')).map((s) => ({ s, spec: specificity(s), index: r.index })))
        .find(({ spec, index }) => cmp(spec, specificity(selector)) > 0 || (cmp(spec, specificity(selector)) === 0 && index > rule.index))
      assert.ok(winner, `${selector} (${specificity(selector)}) is beaten by a revealed rule`)
    }
  }
})

const sampleAppointment: Appointment = { id: '', serviceId: '', dentistId: '', day: '', start: 0, patient: '', hmo: '' }

test('every field of the newsletter and contact forms has a message place linked to it', () => {
  const forms = [...PAGES.map((p) => [p.id, source[p.id]]), ['footer', partials.footer]].flatMap(([id, html]) =>
    [...html.matchAll(/<form [^>]*data-mock-form[^>]*>[\s\S]*?<\/form>/g)].map((m) => [id, m[0]]),
  )
  assert.ok(forms.length >= 2, 'contact and footer forms')
  for (const [id, form] of forms) {
    for (const [tag] of form.matchAll(/<(?:input|textarea|select)\b[^>]*>/g)) {
      const fieldId = tag.match(/\bid="([^"]+)"/)?.[1]
      assert.ok(fieldId, `${id}: every field has an id`)
      // Only a required field can be invalid; the script links its message with aria-describedby while it shows.
      if (/\brequired\b/.test(tag)) assert.ok(form.includes(`id="${fieldId}-error"`), `${id}: ${fieldId} has an error message`)
    }
    assert.ok(form.includes('data-form-status'), `${id}: a status line for the thanks`)
  }
})

test('links in the partials and in 404 use the base placeholder, not the repo’s name', () => {
  for (const [name, html] of [['header', rawPartials.header], ['footer', rawPartials.footer], ['tooth-explorer', rawPartials['tooth-explorer']], ['404.html', rawNotFound]] as const) {
    assert.ok(!/(?:href|src|action)="\/enamel\//.test(html), `${name} has a hard-coded /enamel/ link`)
    assert.ok(name === 'tooth-explorer' || html.includes('href="%BASE_URL%'), `${name} uses %BASE_URL%`)
  }
  assert.ok(includePartials('<!-- include:header -->', rawPartials, '/other/').includes('href="/other/book/"'), 'the base given is the base used')
  assert.ok(!includePartials('<!-- include:footer -->', rawPartials).includes('%BASE_URL%'), 'no placeholder is left behind')
})
