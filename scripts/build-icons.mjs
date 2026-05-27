#!/usr/bin/env node
// Generates resources/icons/app.ico from the CD-authored SVGs.
//   resources/icons/app.svg       — full master (gradients, glow)
//   resources/icons/app-mini.svg  — flat variant tuned for small sizes
//
// Sizes 16/32 are rasterized from the mini SVG; 48–256 from the master.
// Run: npm run build:icons

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT_DIR = join(ROOT, 'resources', 'icons')

const MASTER_SIZES = [48, 64, 128, 256]
const MINI_SIZES = [16, 32]

async function svgToPng(svgBuffer, size) {
  return sharp(svgBuffer, { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const master = await readFile(join(OUT_DIR, 'app.svg'))
  const mini = await readFile(join(OUT_DIR, 'app-mini.svg'))

  const pairs = [
    ...MINI_SIZES.map(s => ({ s, svg: mini })),
    ...MASTER_SIZES.map(s => ({ s, svg: master }))
  ]

  const pngs = await Promise.all(pairs.map(({ s, svg }) => svgToPng(svg, s)))
  const sizes = pairs.map(p => p.s)

  const ico = await pngToIco(pngs)
  await writeFile(join(OUT_DIR, 'app.ico'), ico)
  for (let i = 0; i < sizes.length; i++) {
    await writeFile(join(OUT_DIR, `app-${sizes[i]}.png`), pngs[i])
  }
  console.log(`✓ app.ico (${sizes.join(', ')})`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
