/* Vite leaves %VITE_SITE_URL% as text when the variable is missing and still builds; these checks stop that. */

/** What builds use without VITE_SITE_URL: the local preview address. The Pages workflow passes the published one. */
export const LOCAL_SITE_URL = 'http://localhost:4173/enamel/'

export function assertSiteUrl(value: string | undefined): void {
  if (!value?.trim()) {
    throw new Error('VITE_SITE_URL is not set. Put VITE_SITE_URL=https://<host>/enamel/ in .env (or the build environment): every page’s canonical, og:url and og:image are built from it.')
  }
  if (!/^https?:\/\/[^\s/]+\/.*$/.test(value.trim()) || !value.trim().endsWith('/')) {
    throw new Error(`VITE_SITE_URL is "${value}". Give the full address of the site with a trailing slash, for example https://example.com/enamel/.`)
  }
}

export function assertNoPlaceholders(fileName: string, html: string): void {
  const left = html.match(/%VITE_[A-Z_]+%/)
  if (left) throw new Error(`${fileName} still contains ${left[0]} after the build. Is the variable set in .env?`)
}
