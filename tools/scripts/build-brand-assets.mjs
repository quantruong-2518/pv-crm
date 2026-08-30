import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const renderer = resolve(root, 'tools/brand-render.html')
const chrome = process.env.BRAND_CHROME_BIN

if (!chrome) {
  throw new Error('Set BRAND_CHROME_BIN to a Chromium or Chrome executable')
}

const sources = {
  markBlue: resolve(root, 'packages/ui/src/assets/brand-original/pebble-vina-mark.png'),
  wordmarkBlue: resolve(root, 'packages/ui/src/assets/brand-original/pebble-vina-wordmark.png'),
}

const publicBrand = resolve(root, 'apps/web/public/brand')
const uiAssets = resolve(root, 'packages/ui/src/assets')
const masters = resolve(uiAssets, 'masters')
const remotePort = 9333
const browserProfile = mkdtempSync(join(tmpdir(), 'pv-brand-assets-'))

const assets = [
  {
    output: `${publicBrand}/mark-blue.png`,
    width: 128,
    height: 128,
    padding: 8,
    color: 'markBlue',
    mask: 'markBlue',
  },
  {
    output: `${publicBrand}/mark-light.png`,
    width: 128,
    height: 128,
    padding: 8,
    color: 'markBlue',
    mask: 'markBlue',
    tone: 'light',
  },
  {
    output: `${publicBrand}/mark-blue-512.png`,
    width: 512,
    height: 512,
    padding: 32,
    color: 'markBlue',
    mask: 'markBlue',
  },
  {
    output: `${publicBrand}/mark-light-512.png`,
    width: 512,
    height: 512,
    padding: 32,
    color: 'markBlue',
    mask: 'markBlue',
    tone: 'light',
  },
  {
    output: `${publicBrand}/wordmark-blue.png`,
    width: 640,
    height: 120,
    padding: 4,
    color: 'wordmarkBlue',
    mask: 'wordmarkBlue',
  },
  {
    output: `${publicBrand}/wordmark-light.png`,
    width: 640,
    height: 120,
    padding: 4,
    color: 'wordmarkBlue',
    mask: 'wordmarkBlue',
    tone: 'light',
  },
  {
    output: `${publicBrand}/favicon-blue-16.png`,
    width: 16,
    height: 16,
    padding: 1,
    color: 'markBlue',
    mask: 'markBlue',
  },
  {
    output: `${publicBrand}/favicon-blue-32.png`,
    width: 32,
    height: 32,
    padding: 2,
    color: 'markBlue',
    mask: 'markBlue',
  },
  {
    output: `${publicBrand}/favicon-blue-48.png`,
    width: 48,
    height: 48,
    padding: 3,
    color: 'markBlue',
    mask: 'markBlue',
  },
  {
    output: `${publicBrand}/favicon-light-16.png`,
    width: 16,
    height: 16,
    padding: 1,
    color: 'markBlue',
    mask: 'markBlue',
    tone: 'light',
  },
  {
    output: `${publicBrand}/favicon-light-32.png`,
    width: 32,
    height: 32,
    padding: 2,
    color: 'markBlue',
    mask: 'markBlue',
    tone: 'light',
  },
  {
    output: `${publicBrand}/apple-touch-icon.png`,
    width: 180,
    height: 180,
    padding: 12,
    color: 'markBlue',
    mask: 'markBlue',
  },
  {
    output: `${publicBrand}/icon-192.png`,
    width: 192,
    height: 192,
    padding: 12,
    color: 'markBlue',
    mask: 'markBlue',
  },
  {
    output: `${publicBrand}/icon-512.png`,
    width: 512,
    height: 512,
    padding: 32,
    color: 'markBlue',
    mask: 'markBlue',
  },
  {
    output: `${publicBrand}/og-logo.png`,
    width: 1200,
    height: 630,
    padding: 120,
    color: 'wordmarkBlue',
    mask: 'wordmarkBlue',
  },
  {
    output: `${uiAssets}/mark-blue.png`,
    width: 192,
    height: 192,
    padding: 12,
    color: 'markBlue',
    mask: 'markBlue',
  },
  {
    output: `${uiAssets}/mark-light.png`,
    width: 192,
    height: 192,
    padding: 12,
    color: 'markBlue',
    mask: 'markBlue',
    tone: 'light',
  },
  {
    output: `${uiAssets}/wordmark-blue.png`,
    width: 640,
    height: 120,
    padding: 4,
    color: 'wordmarkBlue',
    mask: 'wordmarkBlue',
  },
  {
    output: `${uiAssets}/wordmark-light.png`,
    width: 640,
    height: 120,
    padding: 4,
    color: 'wordmarkBlue',
    mask: 'wordmarkBlue',
    tone: 'light',
  },
  {
    output: `${masters}/mark-blue.png`,
    width: 1254,
    height: 1254,
    padding: 78,
    color: 'markBlue',
    mask: 'markBlue',
  },
  {
    output: `${masters}/mark-light.png`,
    width: 1254,
    height: 1254,
    padding: 78,
    color: 'markBlue',
    mask: 'markBlue',
    tone: 'light',
  },
  {
    output: `${masters}/wordmark-blue.png`,
    width: 2048,
    height: 384,
    padding: 12,
    color: 'wordmarkBlue',
    mask: 'wordmarkBlue',
  },
  {
    output: `${masters}/wordmark-light.png`,
    width: 2048,
    height: 384,
    padding: 12,
    color: 'wordmarkBlue',
    mask: 'wordmarkBlue',
    tone: 'light',
  },
]

const browser = spawn(
  chrome,
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--allow-file-access-from-files',
    '--hide-scrollbars',
    '--default-background-color=00000000',
    `--remote-debugging-port=${remotePort}`,
    `--user-data-dir=${browserProfile}`,
    'about:blank',
  ],
  {
    env: {
      ...process.env,
      LD_LIBRARY_PATH: process.env.BRAND_CHROME_LIBRARY_PATH ?? process.env.LD_LIBRARY_PATH ?? '',
    },
    stdio: 'ignore',
  },
)

const delay = (milliseconds) =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))

async function findPage() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const pages = await fetch(`http://127.0.0.1:${remotePort}/json/list`).then((response) =>
        response.json(),
      )
      if (pages[0]?.webSocketDebuggerUrl) return pages[0]
    } catch {
      // Chrome needs a short startup window before its debugging endpoint exists.
    }
    await delay(50)
  }
  throw new Error('Chromium debugging endpoint did not start')
}

const page = await findPage()
const socket = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolveOpen, rejectOpen) => {
  socket.addEventListener('open', resolveOpen, { once: true })
  socket.addEventListener('error', rejectOpen, { once: true })
})

let commandId = 0
const pending = new Map()
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (!message.id) return
  const request = pending.get(message.id)
  if (!request) return
  pending.delete(message.id)
  if (message.error) request.reject(new Error(message.error.message))
  else request.resolve(message.result)
})

function call(method, params = {}) {
  const id = ++commandId
  socket.send(JSON.stringify({ id, method, params }))
  return new Promise((resolveCall, rejectCall) => {
    pending.set(id, { resolve: resolveCall, reject: rejectCall })
  })
}

await call('Page.enable')
await call('Emulation.setDefaultBackgroundColorOverride', {
  color: { r: 0, g: 0, b: 0, a: 0 },
})

try {
  for (const asset of assets) {
    mkdirSync(dirname(asset.output), { recursive: true })
    const url = new URL(pathToFileURL(renderer))
    url.searchParams.set('width', String(asset.width))
    url.searchParams.set('height', String(asset.height))
    url.searchParams.set('padding', String(asset.padding))
    url.searchParams.set('tone', asset.tone ?? 'blue')
    url.searchParams.set('color', pathToFileURL(sources[asset.color]).href)
    url.searchParams.set('mask', pathToFileURL(sources[asset.mask ?? asset.color]).href)

    await call('Emulation.setDeviceMetricsOverride', {
      width: asset.width,
      height: asset.height,
      deviceScaleFactor: 1,
      mobile: false,
    })
    await call('Page.navigate', { url: url.href })

    let ready = false
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const state = await call('Runtime.evaluate', {
        expression: "document.documentElement.dataset.ready === 'true'",
        returnByValue: true,
      })
      if (state.result.value) {
        ready = true
        break
      }
      await delay(25)
    }
    if (!ready) throw new Error(`${asset.output}: renderer did not become ready`)

    const screenshot = await call('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
    })
    writeFileSync(asset.output, Buffer.from(screenshot.data, 'base64'))
  }
} finally {
  await call('Browser.close').catch(() => {})
  socket.close()
  browser.kill()
  rmSync(browserProfile, { recursive: true, force: true })
}

const faviconFiles = [
  `${publicBrand}/favicon-blue-16.png`,
  `${publicBrand}/favicon-blue-32.png`,
  `${publicBrand}/favicon-blue-48.png`,
]
const faviconPngs = faviconFiles.map((file) => readFileSync(file))
const headerSize = 6 + faviconPngs.length * 16
const ico = Buffer.alloc(headerSize + faviconPngs.reduce((sum, png) => sum + png.length, 0))
ico.writeUInt16LE(0, 0)
ico.writeUInt16LE(1, 2)
ico.writeUInt16LE(faviconPngs.length, 4)

let imageOffset = headerSize
faviconPngs.forEach((png, index) => {
  const size = [16, 32, 48][index]
  const entry = 6 + index * 16
  ico.writeUInt8(size, entry)
  ico.writeUInt8(size, entry + 1)
  ico.writeUInt8(0, entry + 2)
  ico.writeUInt8(0, entry + 3)
  ico.writeUInt16LE(1, entry + 4)
  ico.writeUInt16LE(32, entry + 6)
  ico.writeUInt32LE(png.length, entry + 8)
  ico.writeUInt32LE(imageOffset, entry + 12)
  png.copy(ico, imageOffset)
  imageOffset += png.length
})
writeFileSync(resolve(root, 'apps/web/public/favicon.ico'), ico)

console.log(`Generated ${assets.length} transparent brand assets and favicon.ico`)
