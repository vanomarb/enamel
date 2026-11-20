export type PartialName = 'header' | 'footer' | 'tooth-explorer'

const INCLUDE = /<!-- include:(header|footer|tooth-explorer)(?: current="([a-z-]+)")? -->/g

/** Replaces each include marker with its partial and marks the `current` page's links; an unknown page throws. */
export function includePartials(html: string, partials: Record<PartialName, string>, base = '/enamel/'): string {
  return withBase(html, base).replace(INCLUDE, (_marker, name: PartialName, current?: string) => {
    let part = partials[name].trim()
    if (current) {
      const link = `data-page="${current}"`
      if (!part.includes(link)) throw new Error(`include:${name}: no link with ${link} for the current page "${current}"`)
      part = part.replaceAll(link, `${link} aria-current="page"`)
    }
    return withBase(part, base)
  })
}

/** Vite fills %BASE_URL% too; doing it here gives the tests the same markup the build makes. */
export function withBase(html: string, base: string): string {
  return html.replaceAll('%BASE_URL%', base)
}
