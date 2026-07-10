// Monero daemon digest-auth proxy (raw TCP passthrough).
//
// Umbrel's monerod enforces HTTP digest auth on every RPC port, but the Eigen
// ASB's wallet cannot send credentials. This proxy injects the auth.
//
// The wallet's block scanner is monerod's own epee HTTP client, which is very
// picky: a normal HTTP proxy that re-serializes responses (Node's http module
// adds Date/Connection, lowercases header names, etc.) makes it fail with
// "http_stream_filter::parse_cached_header" and pull 0 blocks. So this proxy
// works at the raw TCP level: it parses just enough of the request to add the
// Authorization header, then streams monerod's response bytes back UNMODIFIED,
// so the wallet sees exactly what monerod sent.
import net from 'net'
import crypto from 'crypto'

const LISTEN_PORT = parseInt(process.env.MONERO_PROXY_PORT || '18090', 10)
const UP_HOST = process.env.MONERO_NODE_IP || 'monero_monerod_1'
const UP_PORT = parseInt(process.env.MONERO_RPC_PORT || '18081', 10)
const USER = process.env.MONERO_RPC_USER || 'monero'
const PASS = process.env.MONERO_RPC_PASS || ''

const md5 = s => crypto.createHash('md5').update(s).digest('hex')

// Parse one complete HTTP message (Content-Length delimited; monerod and the
// wallet both use Content-Length). Returns null if more bytes are needed.
function parseMsg(buf) {
  const he = buf.indexOf('\r\n\r\n')
  if (he < 0) return null
  const lines = buf.slice(0, he).toString('latin1').split('\r\n')
  let cl = 0
  for (let i = 1; i < lines.length; i++) {
    const m = lines[i].match(/^content-length:\s*(\d+)/i)
    if (m) { cl = parseInt(m[1], 10); break }
  }
  const total = he + 4 + cl
  if (buf.length < total) return null
  return { lines, firstLine: lines[0], headEnd: he + 4, total }
}

function parseChallenge(raw) {
  const h = raw.toString('latin1')
  const get = k => { const m = h.match(new RegExp(k + '\\s*=\\s*"?([^",\\r\\n]+)"?', 'i')); return m ? m[1] : null }
  const realm = get('realm'), nonce = get('nonce')
  if (!realm || !nonce) return null
  return { realm, nonce, qop: get('qop') || 'auth', opaque: get('opaque') }
}

// Build a digest Authorization for a fresh challenge with nc=1. Stateless: every
// request gets its own nonce (monerod issues a unique nonce per 401), so there
// is no shared nc counter to race between concurrent requests.
function authHeader(ch, method, uri) {
  const ncHex = '00000001'
  const cnonce = crypto.randomBytes(8).toString('hex')
  const ha1 = md5(`${USER}:${ch.realm}:${PASS}`)
  const ha2 = md5(`${method}:${uri}`)
  const response = md5(`${ha1}:${ch.nonce}:${ncHex}:${cnonce}:${ch.qop}:${ha2}`)
  let a = `Digest username="${USER}", realm="${ch.realm}", nonce="${ch.nonce}", uri="${uri}", `
        + `qop=${ch.qop}, nc=${ncHex}, cnonce="${cnonce}", response="${response}", algorithm=MD5`
  if (ch.opaque) a += `, opaque="${ch.opaque}"`
  return a
}

// Rebuild the request with the Authorization header set (everything else as-is).
function injectAuth(msg, rawReq, auth) {
  const lines = msg.lines.filter(l => !/^authorization:/i.test(l))
  if (auth) lines.push(`Authorization: ${auth}`)
  const head = lines.join('\r\n') + '\r\n\r\n'
  return Buffer.concat([Buffer.from(head, 'latin1'), rawReq.slice(msg.headEnd, rawReq.length)])
}

// Send a raw request to monerod and return its full raw response.
function connect() {
  return new Promise((resolve, reject) => {
    const sock = net.connect(UP_PORT, UP_HOST)
    sock.once('connect', () => resolve(sock))
    sock.once('error', reject)
    sock.setTimeout(60_000, () => sock.destroy())
  })
}

// Read one full HTTP response from an already-connected socket, leaving any
// extra bytes in state.buf for the next read on the same connection.
function readResponse(sock, state) {
  return new Promise((resolve, reject) => {
    const onData = chunk => {
      state.buf = Buffer.concat([state.buf, chunk])
      const msg = parseMsg(state.buf)
      if (msg) {
        cleanup()
        const raw = state.buf.slice(0, msg.total)
        state.buf = state.buf.slice(msg.total)
        resolve({ raw, status: parseInt(msg.firstLine.split(' ')[1], 10) || 0 })
      }
    }
    const onErr = e => { cleanup(); reject(e) }
    const onClose = () => { cleanup(); reject(new Error('upstream closed')) }
    const cleanup = () => { sock.removeListener('data', onData); sock.removeListener('error', onErr); sock.removeListener('close', onClose) }
    sock.on('data', onData)
    sock.once('error', onErr)
    sock.once('close', onClose)
  })
}

async function handle(rawReq, msg, client) {
  const parts = msg.firstLine.split(' ')
  const method = parts[0], uri = parts[1] || '/'
  let sock
  try {
    // monerod's digest nonce is per-connection, so the unauth probe and the
    // authed retry MUST run on the same upstream socket (like curl --digest).
    sock = await connect()
    const state = { buf: Buffer.alloc(0) }
    sock.write(injectAuth(msg, rawReq, null))
    let resp = await readResponse(sock, state)
    if (resp.status === 401) {
      const ch = parseChallenge(resp.raw)
      if (ch) {
        sock.write(injectAuth(msg, rawReq, authHeader(ch, method, uri)))
        resp = await readResponse(sock, state)
      }
    }
    if (client.writable) client.write(resp.raw) // raw passthrough: byte-identical to monerod
  } catch (e) {
    if (client.writable) client.write(Buffer.from('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n', 'latin1'))
  } finally {
    if (sock) sock.destroy()
  }
}

const server = net.createServer(client => {
  let buf = Buffer.alloc(0)
  let pumping = false
  async function pump() {
    if (pumping) return
    pumping = true
    let msg
    while ((msg = parseMsg(buf))) {
      const rawReq = buf.slice(0, msg.total)
      buf = buf.slice(msg.total)
      await handle(rawReq, msg, client)
    }
    pumping = false
  }
  client.on('data', chunk => { buf = Buffer.concat([buf, chunk]); pump().catch(() => {}) })
  client.on('error', () => {})
  // Never kill idle client connections. The ASB's HTTP client pools its
  // connection and reuses it minutes later; an idle-timeout destroy here made
  // every other quote fail with "ChannelClosed" (it picked up the dead socket).
  // TCP keepalive reaps genuinely dead peers instead.
  client.setKeepAlive(true, 60_000)
})

process.on('uncaughtException', e => console.error('uncaught:', e && e.message))
process.on('unhandledRejection', e => console.error('unhandledRejection:', e && e.message))

server.listen(LISTEN_PORT, '127.0.0.1', () =>
  console.log(`monero digest proxy (raw) on 127.0.0.1:${LISTEN_PORT} -> ${UP_HOST}:${UP_PORT}`))
