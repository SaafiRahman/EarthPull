import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// The pipeline's export (region JSON files and card images) is served as-is at /export/*, so the demo always shows
// the latest pipeline run without copying ~500 MB into web/.
const EXPORT_DIR = resolve(__dirname, '..', 'pipeline', 'data', 'export')
const TYPES: Record<string, string> = { '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg' }

function serveExport(): Plugin {
  const handler = (req: { url?: string }, res: import('node:http').ServerResponse, next: () => void) => {
    const url = decodeURIComponent((req.url || '').split('?')[0])
    if (!url.startsWith('/export/')) return next()
    const file = normalize(join(EXPORT_DIR, url.slice('/export/'.length)))
    if (!file.startsWith(EXPORT_DIR) || !existsSync(file) || !statSync(file).isFile()) {
      res.statusCode = 404
      return res.end('not found')
    }
    res.setHeader('Content-Type', TYPES[extname(file)] || 'application/octet-stream')
    res.setHeader('Cache-Control', 'public, max-age=3600')
    createReadStream(file).pipe(res)
  }
  return {
    name: 'serve-pipeline-export',
    configureServer: (server) => { server.middlewares.use(handler) },
    configurePreviewServer: (server) => { server.middlewares.use(handler) },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), serveExport()],
  // MapLibre loads its worker from a file next to its own module; Vite's dependency pre-bundling moves the module and
  // breaks that path ("Worker failed to load"), so serve maplibre-gl as-is.
  optimizeDeps: { exclude: ['maplibre-gl'] },
  // Lets the developer open the dev server from a phone through a Cloudflare quick tunnel (random *.trycloudflare.com
  // address, started by hand with `cloudflared tunnel --url http://localhost:5173`)
  server: { allowedHosts: ['.trycloudflare.com'] },
  // The phone link serves the release build (`vite build --watch` + `vite preview`): the development build stuttered
  // on phones during the pack opening (2026-11-26)
  preview: { allowedHosts: ['.trycloudflare.com'] },
})
