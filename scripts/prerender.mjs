

import { readFileSync, rmSync, writeFileSync } from 'node:fs'

const file = new URL('../dist/index.html', import.meta.url)
const { render } = await import(new URL('../dist-ssr/entry-server.js', import.meta.url).href)

const html = readFileSync(file, 'utf8')
const slot = '<div id="root"></div>'
if (!html.includes(slot)) throw new Error(`prerender: ${slot} not found in dist/index.html`)
writeFileSync(file, html.replace(slot, () => `<div id="root">${render('/')}</div>`))

rmSync(new URL('../dist-ssr', import.meta.url), { recursive: true, force: true })
console.log('prerender: / → dist/index.html')
