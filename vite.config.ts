import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { includePartials } from './build/partials.ts'
import { LOCAL_SITE_URL, assertNoPlaceholders, assertSiteUrl } from './build/site-url.ts'

const page = (name: string) => fileURLToPath(new URL(name, import.meta.url))

const pages = Object.fromEntries(
  readdirSync(page('./app/'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(page(`./app/${entry.name}/index.html`)))
    .map((entry) => [entry.name, page(`./app/${entry.name}/index.html`)]),
)

/* Partials are read on every transform, so an edited partial shows on the next reload. */
function sharedPartials(): Plugin {
  let base = '/enamel/'
  const dir = fileURLToPath(new URL('./app/components/', import.meta.url))
  const read = (file: string) => readFileSync(`${dir}${file}`, 'utf8')
  return {
    name: 'shared-partials',
    configResolved(config) {
      base = config.base
    },
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => includePartials(html, { header: read('header.html'), footer: read('footer.html'), 'tooth-explorer': read('tooth-explorer/tooth-explorer.html') }, base),
    },
    configureServer(server) {
      server.watcher.add(dir)
      server.watcher.on('change', (file) => {
        if (file.startsWith(dir) && file.endsWith('.html')) server.ws.send({ type: 'full-reload' })
      })
    },
  }
}

function inlinePhosphor(): Plugin {
  const assets = fileURLToPath(new URL('./node_modules/@phosphor-icons/core/assets/', import.meta.url))
  return {
    name: 'inline-phosphor',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => {
        const out = html.replace(
          /<i data-icon="([a-z-]+)" data-weight="([a-z]+)"(?: class="([^"]*)")?><\/i>/g,
          (_, name: string, weight: string, classes?: string) => {
            const file = weight === 'regular' ? `${name}.svg` : `${name}-${weight}.svg`
            const svg = readFileSync(`${assets}${weight}/${file}`, 'utf8').trim()
            const attrs = `${classes ? `class="${classes}" ` : ''}aria-hidden="true" focusable="false" `
            return svg.replace('<svg ', `<svg ${attrs}`)
          },
        )
        if (out.includes('data-icon=')) {
          throw new Error('inline-phosphor: an icon was left unreplaced. Write it as <i data-icon="…" data-weight="…" class="…"></i>.')
        }
        return out
      },
    },
  }
}

/* The heads preload fonts from /node_modules/, which sits outside the Vite root (app/): point those URLs at the real folder. */
function nodeModulesUrls(): Plugin {
  const dir = fileURLToPath(new URL('./node_modules/', import.meta.url))
  return {
    name: 'node-modules-urls',
    transformIndexHtml: {
      order: 'pre',
      handler: (html, { filename, server }) => html.replaceAll('"/node_modules/', `"${server ? `/@fs${dir}` : `${relative(dirname(filename), dir)}/`}`),
    },
  }
}

function siteUrlGuard(): Plugin {
  return {
    name: 'site-url-guard',
    apply: 'build',
    configResolved(config) {
      assertSiteUrl(loadEnv(config.mode, config.envDir, 'VITE_').VITE_SITE_URL)
    },
    generateBundle(_options, bundle) {
      for (const [fileName, file] of Object.entries(bundle)) {
        if (file.type === 'asset' && fileName.endsWith('.html')) assertNoPlaceholders(fileName, String(file.source))
      }
    },
  }
}

export default defineConfig(({ mode }) => {
  // Without the variable or a .env, the local preview address; the Pages workflow passes the published one.
  if (loadEnv(mode, page('./'), 'VITE_').VITE_SITE_URL === undefined) process.env.VITE_SITE_URL = LOCAL_SITE_URL
  return {
  root: 'app',
  base: '/enamel/',
  publicDir: '../public',
  envDir: '..',
  plugins: [tailwindcss(), sharedPartials(), inlinePhosphor(), nodeModulesUrls(), siteUrlGuard()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2022',
    rolldownOptions: {
      input: {
        main: page('./app/index.html'),
        ...pages,
        notFound: page('./app/404.html'),
      },
    },
  },
  }
})
