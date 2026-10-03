// Injects the server-rendered landing (`/`) into dist/index.html's #root. Runs after
// `vite build` and `vite build --ssr src/entry-server.tsx --outDir dist-ssr` (see npm run build).
import { readFileSync, rmSync, writeFileSync } from 'node:fs'

const file = new URL('../dist/index.html', import.meta.url)
const { render } = await import(new URL('../dist-ssr/entry-server.js', import.meta.url).href)

const html = readFileSync(file, 'utf8')
const slot = '<div id="root"></div>'
if (!html.includes(slot)) throw new Error(`prerender: ${slot} not found in dist/index.html`)
writeFileSync(file, html.replace(slot, () => `<div id="root">${render('/')}</div>`))
// dist-ssr is only this script's input; drop it so linters and deploys never pick it up.
rmSync(new URL('../dist-ssr', import.meta.url), { recursive: true, force: true })
console.log('prerender: / → dist/index.html')
