/**
 * Génère build/icon.ico (multi-résolutions) sans aucune dépendance.
 * Design : carré arrondi ardoise (thème app) + étoile dorée (haut fait).
 * PNG encodé via zlib intégré à Node, puis empaqueté au format ICO.
 *
 * Lancer : node scripts/make-icon.cjs
 */
const zlib = require('zlib')
const { writeFileSync, mkdirSync } = require('fs')
const { resolve, dirname } = require('path')

const SIZES = [16, 24, 32, 48, 64, 128, 256]
const SS = 4 // suréchantillonnage (anti-aliasing)

// Palette (thème de l'app)
const BG_TOP = [30, 41, 59] // slate-800
const BG_BOT = [15, 23, 42] // slate-900
const STAR_TOP = [253, 230, 138] // amber-200
const STAR_BOT = [245, 158, 11] // amber-500
const RING = [52, 211, 153] // emerald-400

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t)
}
function mix(c1, c2, t) {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)]
}

// Point dans un rectangle à coins arrondis [0..1] avec rayon r (en unités normalisées)
function inRoundedRect(x, y, r) {
  const nx = Math.min(x, 1 - x)
  const ny = Math.min(y, 1 - y)
  if (nx >= r && ny >= r) return true
  if (nx >= r || ny >= r) return nx >= 0 && ny >= 0
  const dx = r - nx
  const dy = r - ny
  return dx * dx + dy * dy <= r * r
}

// Sommets d'une étoile à 5 branches, centrée (cx,cy), rayons (outer,inner)
function starVertices(cx, cy, outer, inner) {
  const pts = []
  for (let i = 0; i < 10; i++) {
    const ang = (Math.PI / 5) * i - Math.PI / 2
    const rad = i % 2 === 0 ? outer : inner
    pts.push([cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad])
  }
  return pts
}

function inPolygon(x, y, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

// Distance approx d'un point à un anneau (pour la bordure émeraude)
function ringAlpha(x, y, r) {
  // bordure le long du rectangle arrondi, épaisseur ~0.025
  const nx = Math.min(x, 1 - x)
  const ny = Math.min(y, 1 - y)
  let d
  if (nx >= r && ny >= r) d = Math.min(nx, ny)
  else {
    const dx = r - Math.min(nx, r)
    const dy = r - Math.min(ny, r)
    d = r - Math.sqrt(dx * dx + dy * dy)
  }
  const edge = 0.045
  const t = 1 - Math.min(1, Math.abs(d - edge) / 0.02)
  return Math.max(0, t)
}

function renderSize(size) {
  const S = size * SS
  const star = starVertices(0.5 * S, 0.47 * S, 0.37 * S, 0.16 * S)
  const r = 0.2 // rayon de coin normalisé
  const buf = Buffer.alloc(size * size * 4)

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let R = 0,
        G = 0,
        B = 0,
        A = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = px * SS + sx + 0.5
          const fy = py * SS + sy + 0.5
          const nxn = fx / S
          const nyn = fy / S
          let cr = 0,
            cg = 0,
            cb = 0,
            ca = 0
          if (inRoundedRect(nxn, nyn, r)) {
            const bg = mix(BG_TOP, BG_BOT, nyn)
            cr = bg[0]
            cg = bg[1]
            cb = bg[2]
            ca = 255
            // bordure émeraude
            const ra = ringAlpha(nxn, nyn, r)
            if (ra > 0) {
              cr = lerp(cr, RING[0], ra * 0.8)
              cg = lerp(cg, RING[1], ra * 0.8)
              cb = lerp(cb, RING[2], ra * 0.8)
            }
            // étoile
            if (inPolygon(fx, fy, star)) {
              const st = mix(STAR_TOP, STAR_BOT, (nyn - 0.12) / 0.7)
              cr = st[0]
              cg = st[1]
              cb = st[2]
            }
          }
          R += cr
          G += cg
          B += cb
          A += ca
        }
      }
      const n = SS * SS
      const o = (py * size + px) * 4
      buf[o] = Math.round(R / n)
      buf[o + 1] = Math.round(G / n)
      buf[o + 2] = Math.round(B / n)
      buf[o + 3] = Math.round(A / n)
    }
  }
  return buf
}

// ---- Encodage PNG ----
const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}
function encodePng(rgba, size) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // couleur RGBA
  // raw scanlines avec octet de filtre 0
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  const idat = zlib.deflateSync(raw, { level: 9 })
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

// ---- Empaquetage ICO ----
function buildIco(pngs) {
  const count = pngs.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2) // type icône
  header.writeUInt16LE(count, 4)
  const dir = Buffer.alloc(count * 16)
  let offset = 6 + count * 16
  pngs.forEach((p, i) => {
    const e = dir.subarray(i * 16)
    e[0] = p.size >= 256 ? 0 : p.size
    e[1] = p.size >= 256 ? 0 : p.size
    e[2] = 0 // palette
    e[3] = 0
    e.writeUInt16LE(1, 4) // plans
    e.writeUInt16LE(32, 6) // bits/pixel
    e.writeUInt32LE(p.data.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += p.data.length
  })
  return Buffer.concat([header, dir, ...pngs.map((p) => p.data)])
}

const pngs = SIZES.map((size) => {
  process.stdout.write(`\r  rendu ${size}×${size}…   `)
  return { size, data: encodePng(renderSize(size), size) }
})
const ico = buildIco(pngs)
const out = resolve(process.cwd(), 'build', 'icon.ico')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, ico)
// PNG 256 isolé (utile pour Linux / fenêtre)
writeFileSync(resolve(process.cwd(), 'build', 'icon.png'), pngs[pngs.length - 1].data)
console.log(`\n✔ ${out} (${(ico.length / 1024).toFixed(1)} Ko, ${SIZES.length} tailles)`)
