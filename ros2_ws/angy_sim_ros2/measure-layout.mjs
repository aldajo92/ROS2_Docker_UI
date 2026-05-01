import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'

const W = parseInt(process.argv[2] || '680', 10)
const H = parseInt(process.argv[3] || '900', 10)

const script = `
(() => {
  const selectors = [
    'html', 'body', '#root', 'main.app-shell',
    '.layout', '.layout-left', '.viewport-surface',
    'section.panel.viewport', '.viewport-stage',
    '.viewport-stage > canvas', '.layout-right',
    '.layout-right > .panel'
  ];
  const out = selectors.map(sel => {
    const el = document.querySelector(sel);
    if (!el) return { sel, found: false };
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      sel, found: true, tag: el.tagName, cls: String(el.className || ''),
      rect: { top: +r.top.toFixed(1), left: +r.left.toFixed(1), width: +r.width.toFixed(1), height: +r.height.toFixed(1) },
      style: {
        position: cs.position, display: cs.display, flex: cs.flex,
        height: cs.height, minHeight: cs.minHeight, width: cs.width,
        gridTemplateColumns: cs.gridTemplateColumns,
      }
    };
  });
  const c = document.querySelector('canvas');
  const cp = c ? { tag: c.parentElement.tagName, cls: String(c.parentElement.className||''), attrW: c.width, attrH: c.height, cssW: c.style.width, cssH: c.style.height } : null;
  const mq = matchMedia('(max-width: 700px)').matches;
  return { mq, inner: { w: innerWidth, h: innerHeight }, selectors: out, canvas: cp };
})()
`.trim()

const url = 'http://localhost:5174/'
// Use chrome's Puppeteer-less approach: launch chrome with remote debugging.
const port = 9444 + Math.floor(Math.random() * 100)
const userDataDir = '/tmp/chrome-dbg-' + port
const chrome = spawn('google-chrome', [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--hide-scrollbars',
  `--window-size=${W},${H}`,
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${userDataDir}`,
  url,
], { stdio: 'ignore', detached: true })

// Wait for chrome to boot.
await new Promise(r => setTimeout(r, 1500))

// Find the page WS URL.
const versionRes = await fetch(`http://localhost:${port}/json/version`).then(r => r.json())
const listRes = await fetch(`http://localhost:${port}/json/list`).then(r => r.json())
const page = listRes.find(p => p.type === 'page' && p.url.includes('localhost:5174'))
if (!page) { console.error('No page found', JSON.stringify(listRes, null, 2)); chrome.kill(); process.exit(1) }

// Connect websocket manually.
const { WebSocket } = await import('ws').catch(() => ({ WebSocket: null }))
if (!WebSocket) { console.error('install ws'); chrome.kill(); process.exit(1) }

const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
ws.on('message', (msg) => {
  const m = JSON.parse(msg.toString())
  if (m.id && pending.has(m.id)) {
    const { resolve } = pending.get(m.id)
    pending.delete(m.id)
    resolve(m)
  }
})
const call = (method, params) => new Promise((resolve) => {
  id++
  pending.set(id, { resolve })
  ws.send(JSON.stringify({ id, method, params }))
})
await new Promise(r => ws.on('open', r))

// Wait for full load.
await new Promise(r => setTimeout(r, 4000))

// Evaluate.
const r = await call('Runtime.evaluate', {
  expression: script,
  returnByValue: true,
  awaitPromise: true,
})
console.log(JSON.stringify(r.result?.value ?? r, null, 2))
ws.close()
chrome.kill()
setTimeout(() => process.exit(0), 200)
