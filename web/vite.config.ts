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
})
