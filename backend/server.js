import express from 'express'
import helmet from 'helmet'
import compression from 'compression'
import rateLimit from 'express-rate-limit'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import TOML from '@iarna/toml'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.ASB_DATA_DIR || '/data'
const CONFIG_PATH = process.env.ASB_CONFIG_PATH || path.join(DATA_DIR, 'config.toml')
const RPC_PASSWORD = fs.readFileSync(process.env.ASB_RPC_PASSWORD_FILE || '/data/rpc-password', 'utf8').trim()
const JWT_SECRET_FILE = process.env.ASB_JWT_SECRET_FILE || '/data/jwt-secret'
// let, not const: rotated on password change so old sessions die immediately.
let JWT_SECRET = fs.readFileSync(JWT_SECRET_FILE, 'utf8').trim()
function rotateJwtSecret() {
  JWT_SECRET = crypto.randomBytes(32).toString('hex')
  fs.writeFileSync(JWT_SECRET_FILE, JWT_SECRET, { mode: 0o600 })
}
const HASH_FILE = process.env.ASB_DASHBOARD_PASSWORD_HASH_FILE || '/data/dashboard-password-hash'
const RPC_URL = process.env.ASB_RPC_URL || 'http://127.0.0.1:9944'
// The ASB writes its general human-readable log to swap-all.log; asb.err.log is
// supervisord's capture of the same stream. Prefer whichever exists.
const LOG_CANDIDATES = [
  path.join(DATA_DIR, 'logs', 'swap-all.log'),
  path.join(DATA_DIR, 'logs', 'asb.err.log')
]

const SATS_PER_BTC = 100_000_000
const PICO_PER_XMR = 1_000_000_000_000

const app = express()
app.set('trust proxy', 1)
// No cors(): the dashboard is same-origin behind nginx; cross-origin browser
// access has no legitimate use and only widens the attack surface.
app.use(helmet({ contentSecurityPolicy: false })) // CSP is set by nginx (it serves the HTML)
app.use(compression())
app.use(express.json({ limit: '1mb' }))

const limiter = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false })
app.use('/api/', limiter)

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
}

// ---- Dashboard password (set by the user on first run) ----------------------
function passwordSet() {
  return fs.existsSync(HASH_FILE) && fs.readFileSync(HASH_FILE, 'utf8').trim().length > 0
}
function readHash() {
  return fs.readFileSync(HASH_FILE, 'utf8').trim()
}
function writeHash(password) {
  fs.writeFileSync(HASH_FILE, bcrypt.hashSync(password, 12), { mode: 0o600 })
}
function issueToken() {
  return jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '7d' })
}

function requireAuth(req, res, next) {
  const m = (req.headers.authorization || '').match(/^Bearer (.+)$/)
  if (!m) return res.status(401).json({ error: 'Missing token' })
  try {
    req.user = jwt.verify(m[1], JWT_SECRET)
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }
}

// ---- ASB JSON-RPC -----------------------------------------------------------
async function asbRpc(method, params = []) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RPC_PASSWORD}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`RPC ${res.status}: ${text.slice(0, 200)}`)
  const json = JSON.parse(text)
  if (json.error) throw new Error(json.error.message || 'RPC error')
  return json.result
}

let asbReady = false
async function checkAsb() {
  try {
    await asbRpc('check_connection')
    asbReady = true
  } catch {
    asbReady = false
  }
  return asbReady
}
setInterval(checkAsb, 5000)
checkAsb()

function requireAsb(res) {
  if (!asbReady) {
    res.status(503).json({ error: 'ASB is still starting up. The initial wallet scan can take a while.' })
    return false
  }
  return true
}

// supervisord manages the asb process inside the container; overridable so the
// restore/restart flow can be exercised outside the container in tests.
const SUPERVISORCTL = process.env.ASB_SUPERVISORCTL || '/usr/bin/supervisorctl -c /etc/supervisor/supervisord.conf'

function sh(cmd) {
  return import('child_process').then(({ exec }) => new Promise((resolve, reject) => {
    exec(cmd, (err, stdout, stderr) => (err ? reject(new Error(String(stderr || err))) : resolve(stdout)))
  }))
}

// Pipe a gzip buffer through `tar` on stdin, either listing or extracting it.
// Verbose listing so each entry carries its type flag: a symlink or hardlink
// smuggled into a backup could redirect later entries outside the data dir, so
// restore refuses them outright.
function tarList(gzBuf) {
  return new Promise((resolve, reject) => {
    const p = spawn('tar', ['tvzf', '-'])
    let out = '', err = ''
    p.stdout.on('data', d => { out += d })
    p.stderr.on('data', d => { err += d })
    p.on('error', reject)
    p.on('close', code => {
      if (code !== 0) return reject(new Error(err || 'archive is not readable'))
      const entries = []
      for (const line of out.split('\n')) {
        if (!line.trim()) continue
        const type = line[0] // -, d, l (symlink), h (hardlink), ...
        // tar tv format: perms owner size date time NAME [-> target]
        const m = line.match(/(?:\d{2}:\d{2})\s+(.+?)(?:\s+->\s+.*)?$/)
        entries.push({ type, name: m ? m[1] : line })
      }
      resolve(entries)
    })
    p.stdin.on('error', () => {})
    p.stdin.end(gzBuf)
  })
}
function tarExtract(gzBuf, dest) {
  return new Promise((resolve, reject) => {
    const p = spawn('tar', ['xzf', '-', '-C', dest, '--no-same-owner'])
    let err = ''
    p.stderr.on('data', d => { err += d })
    p.on('error', reject)
    p.on('close', code => code === 0 ? resolve() : reject(new Error(err || 'extract failed')))
    p.stdin.on('error', () => {})
    p.stdin.end(gzBuf)
  })
}

// ---- Auth routes (no token required) ----------------------------------------
app.get('/api/auth/status', (req, res) => res.json({ passwordSet: passwordSet() }))

app.post('/api/auth/setup', asyncHandler(async (req, res) => {
  if (passwordSet()) return res.status(409).json({ error: 'Password already set' })
  const { password } = req.body || {}
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' })
  }
  writeHash(password)
  res.json({ token: issueToken() })
}))

app.post('/api/auth/login', asyncHandler(async (req, res) => {
  if (!passwordSet()) return res.status(409).json({ error: 'No password set yet' })
  const { password } = req.body || {}
  if (typeof password !== 'string' || !bcrypt.compareSync(password, readHash())) {
    return res.status(401).json({ error: 'Invalid password' })
  }
  res.json({ token: issueToken() })
}))

app.get('/api/auth/check', requireAuth, (req, res) => res.json({ ok: true }))

app.post('/api/auth/change', requireAuth, asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body || {}
  if (typeof oldPassword !== 'string' || !bcrypt.compareSync(oldPassword, readHash())) {
    return res.status(401).json({ error: 'Current password is incorrect' })
  }
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' })
  }
  writeHash(newPassword)
  // Invalidate every existing session: a password change usually means the
  // operator suspects a leak, so old tokens must stop working now, not in 7 days.
  rotateJwtSecret()
  res.json({ token: issueToken() })
}))

// ---- Status -----------------------------------------------------------------
app.get('/api/status', requireAuth, (req, res) => res.json({ asbConnected: asbReady }))

// ---- Balances + funding (Monero deposit) address ----------------------------
app.get('/api/balances', requireAuth, asyncHandler(async (req, res) => {
  if (!requireAsb(res)) return
  const [btc, xmrBal, xmrAddr] = await Promise.all([
    asbRpc('bitcoin_balance'),
    asbRpc('monero_balance'),
    asbRpc('monero_address')
  ])
  // unlocked may be absent on older asb builds; fall back to total so we never
  // show a negative pending amount.
  const totalPico = xmrBal.balance
  const unlockedPico = xmrBal.unlocked != null ? xmrBal.unlocked : totalPico
  const pendingPico = Math.max(0, totalPico - unlockedPico)
  res.json({
    bitcoin: { balance: btc.balance / SATS_PER_BTC, sats: btc.balance },
    monero: {
      balance: totalPico / PICO_PER_XMR,
      unlocked: unlockedPico / PICO_PER_XMR,
      pending: pendingPico / PICO_PER_XMR,
      piconero: totalPico,
      address: xmrAddr.address
    }
  })
}))

// Funding/deposit address on its own so the UI can show it before the wallet syncs
app.get('/api/deposit', requireAuth, asyncHandler(async (req, res) => {
  if (!requireAsb(res)) return
  const xmrAddr = await asbRpc('monero_address')
  res.json({ moneroAddress: xmrAddr.address })
}))

// ---- Quote ------------------------------------------------------------------
app.get('/api/quote', requireAuth, asyncHandler(async (req, res) => {
  if (!requireAsb(res)) return
  const q = await asbRpc('get_current_quote')
  res.json({
    price: q.price / SATS_PER_BTC,
    min_quantity: q.min_quantity / SATS_PER_BTC,
    max_quantity: q.max_quantity / SATS_PER_BTC
  })
}))

// ---- Swaps ------------------------------------------------------------------
app.get('/api/swaps', requireAuth, asyncHandler(async (req, res) => {
  if (!requireAsb(res)) return
  res.json({ swaps: await asbRpc('get_swaps') || [] })
}))

// ---- Connectivity: peer id, connections, rendezvous, onion ------------------
app.get('/api/connectivity', requireAuth, asyncHandler(async (req, res) => {
  if (!requireAsb(res)) return
  const [peer, conns, regs, onion, multi] = await Promise.all([
    asbRpc('peer_id'),
    asbRpc('active_connections').catch(() => ({ connections: 0 })),
    asbRpc('registration_status').catch(() => ({ registrations: [] })),
    asbRpc('onion_service_status').catch(() => null),
    asbRpc('multiaddresses').catch(() => ({ multiaddresses: [] }))
  ])
  res.json({
    peerId: peer.peer_id,
    connections: conns.connections ?? 0,
    registrations: regs.registrations || [],
    onion,
    multiaddresses: multi.multiaddresses || []
  })
}))

// ---- Withdraw BTC to an external wallet --------------------------------------
// Requires the dashboard password again, like seeds and backups: a leaked
// session token alone must not be able to move funds.
app.post('/api/withdraw', requireAuth, asyncHandler(async (req, res) => {
  const { address, amount, sweep, password } = req.body || {}
  // Password first: the stricter gate, and it must not depend on ASB state.
  if (typeof password !== 'string' || !bcrypt.compareSync(password, readHash())) {
    return res.status(401).json({ error: 'Password confirmation failed' })
  }
  if (!requireAsb(res)) return
  if (typeof address !== 'string' || !address.trim()) {
    return res.status(400).json({ error: 'Bitcoin address required' })
  }
  // amount is BTC from the UI; ASB expects sats. Omit (None) to sweep everything.
  let sats
  if (!sweep) {
    const btc = Number(amount)
    if (!Number.isFinite(btc) || btc <= 0) return res.status(400).json({ error: 'Enter a valid amount or choose sweep' })
    sats = Math.round(btc * SATS_PER_BTC)
  }
  const result = await asbRpc('withdraw_btc', sweep ? [address.trim(), null] : [address.trim(), sats])
  recordWithdrawal({ txid: result.txid, amount: result.amount / SATS_PER_BTC, address: address.trim(), ts: new Date().toISOString() })
  res.json({ txid: result.txid, amount: result.amount / SATS_PER_BTC })
}))

// ---- Withdraw XMR to an external wallet ---------------------------------------
// Same password rule as BTC. The ASB refuses on its side while a swap is in
// flight (that XMR is committed to the protocol).
app.post('/api/withdraw-xmr', requireAuth, asyncHandler(async (req, res) => {
  const { address, amount, sweep, password } = req.body || {}
  if (typeof password !== 'string' || !bcrypt.compareSync(password, readHash())) {
    return res.status(401).json({ error: 'Password confirmation failed' })
  }
  if (!requireAsb(res)) return
  if (typeof address !== 'string' || !address.trim()) {
    return res.status(400).json({ error: 'Monero address required' })
  }
  // amount is XMR from the UI; the ASB expects piconero. Omit (null) to sweep.
  let pico = null
  if (!sweep) {
    const xmr = Number(amount)
    if (!Number.isFinite(xmr) || xmr <= 0) return res.status(400).json({ error: 'Enter a valid amount or choose sweep' })
    pico = Math.round(xmr * PICO_PER_XMR)
  }
  const result = await asbRpc('withdraw_xmr', [address.trim(), pico])
  res.json({ txid: result.txid, amount: result.amount / PICO_PER_XMR })
}))

// ---- Monero wallet history ----------------------------------------------------
// Deposits and withdrawals straight from the embedded wallet, with txids the UI
// links to the configured Monero explorer.
app.get('/api/monero-history', requireAuth, asyncHandler(async (req, res) => {
  if (!requireAsb(res)) return
  const h = await asbRpc('monero_history')
  const transactions = (h.transactions || [])
    .map(t => ({
      txid: t.tx_hash,
      amount: t.amount / PICO_PER_XMR,
      fee: t.fee / PICO_PER_XMR,
      confirmations: t.confirmations,
      direction: t.direction, // "In" | "Out"
      timestamp: t.timestamp
    }))
    .sort((a, b) => b.timestamp - a.timestamp)
  res.json({ transactions })
}))

// ---- Bitcoin activity ---------------------------------------------------------
// The ASB has no transaction-history RPC, so we assemble activity from what we
// can know: withdrawals we broadcast (journaled here) and swap redeem/punish
// transactions from the swap list.
const WITHDRAWALS_FILE = path.join(DATA_DIR, 'withdrawals.json')
function readWithdrawals() {
  try { return JSON.parse(fs.readFileSync(WITHDRAWALS_FILE, 'utf8')) } catch { return [] }
}
function recordWithdrawal(entry) {
  try {
    const list = readWithdrawals()
    list.push(entry)
    fs.writeFileSync(WITHDRAWALS_FILE, JSON.stringify(list.slice(-500), null, 2), { mode: 0o600 })
  } catch { /* journaling must never fail the withdrawal itself */ }
}

app.get('/api/activity', requireAuth, asyncHandler(async (req, res) => {
  const withdrawals = readWithdrawals().map(w => ({ type: 'withdrawal', ...w }))
  let swapTxs = []
  if (asbReady) {
    try {
      const swaps = await asbRpc('get_swaps') || []
      for (const s of swaps) {
        // Redeem/punish txids are deterministic and present pre-broadcast; only
        // surface them once the swap state says they are real events.
        const st = (s.state || '').toLowerCase()
        if (s.btc_redeem_txid && st.includes('redeem')) {
          swapTxs.push({ type: 'swap-redeem', txid: s.btc_redeem_txid, amount: s.btc_amount / SATS_PER_BTC, ts: s.start_date, swap_id: s.swap_id })
        }
        if (s.btc_punish_txid && st.includes('punish')) {
          swapTxs.push({ type: 'swap-punish', txid: s.btc_punish_txid, amount: s.btc_amount / SATS_PER_BTC, ts: s.start_date, swap_id: s.swap_id })
        }
      }
    } catch { /* swap list unavailable while asb restarts; show withdrawals only */ }
  }
  const items = [...withdrawals, ...swapTxs].sort((a, b) => String(b.ts).localeCompare(String(a.ts)))
  res.json({ items })
}))

// ---- Dashboard UI settings ----------------------------------------------------
// Small preferences (block explorer URLs) live in their own file: config.toml
// belongs to the ASB and rejects unknown fields outright.
const UI_SETTINGS_FILE = path.join(DATA_DIR, 'ui-settings.json')
function readUiSettings() {
  try { return JSON.parse(fs.readFileSync(UI_SETTINGS_FILE, 'utf8')) } catch { return {} }
}
app.get('/api/ui-settings', requireAuth, (req, res) => res.json(readUiSettings()))
app.post('/api/ui-settings', requireAuth, asyncHandler(async (req, res) => {
  const { btcExplorer, xmrExplorer } = req.body || {}
  const clean = v => {
    if (typeof v !== 'string' || !v.trim()) return ''
    const u = v.trim().replace(/\/+$/, '')
    if (!/^https?:\/\//.test(u)) throw new Error('Explorer URLs must start with http:// or https://')
    return u
  }
  let settings
  try {
    settings = { ...readUiSettings(), btcExplorer: clean(btcExplorer), xmrExplorer: clean(xmrExplorer) }
  } catch (e) {
    return res.status(400).json({ error: e.message })
  }
  fs.writeFileSync(UI_SETTINGS_FILE, JSON.stringify(settings, null, 2), { mode: 0o600 })
  res.json(settings)
}))

// ---- Config -----------------------------------------------------------------
app.get('/api/config', requireAuth, asyncHandler(async (req, res) => {
  res.json({ config: TOML.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) })
}))

app.post('/api/config', requireAuth, asyncHandler(async (req, res) => {
  const { config } = req.body
  if (!config || typeof config !== 'object') return res.status(400).json({ error: 'Invalid config' })
  // The maker binary floors the developer tip at 1% regardless of what the
  // config says. Clamp here too so the file on disk never claims a number the
  // engine will not honor.
  if (config.maker && (typeof config.maker.developer_tip !== 'number' || config.maker.developer_tip < 0.01)) {
    config.maker.developer_tip = 0.01
  }
  fs.writeFileSync(CONFIG_PATH, TOML.stringify(config))
  res.json({ ok: true, needsRestart: true })
}))

app.post('/api/restart', requireAuth, asyncHandler(async (req, res) => {
  try { await sh(`${SUPERVISORCTL} restart asb`); res.json({ ok: true }) }
  catch (e) { res.status(500).json({ error: e.message }) }
}))

// ---- Logs -------------------------------------------------------------------
app.get('/api/logs', requireAuth, asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 200, 1000)
  let lines = []
  const logPath = LOG_CANDIDATES.find(p => fs.existsSync(p))
  if (logPath) {
    // Tail-read only the last chunk; the log grows unbounded and the UI polls
    // every 10s, so reading the whole file would get heavier by the day.
    const TAIL = 256 * 1024
    const { size } = fs.statSync(logPath)
    const start = Math.max(0, size - TAIL)
    const fd = fs.openSync(logPath, 'r')
    try {
      const buf = Buffer.alloc(size - start)
      fs.readSync(fd, buf, 0, buf.length, start)
      lines = buf.toString('utf8').split('\n').filter(Boolean)
      if (start > 0) lines.shift() // drop the partial first line
      lines = lines.slice(-limit)
    } finally {
      fs.closeSync(fd)
    }
  }
  res.json({ lines })
}))

// ---- Seeds (re-confirm the dashboard password before revealing) -------------
app.post('/api/seeds/:type', requireAuth, asyncHandler(async (req, res) => {
  const { password } = req.body || {}
  if (typeof password !== 'string' || !bcrypt.compareSync(password, readHash())) {
    return res.status(401).json({ error: 'Password confirmation failed' })
  }
  if (!requireAsb(res)) return
  if (req.params.type === 'monero') {
    const s = await asbRpc('monero_seed')
    return res.json({ seed: s.seed, restore_height: s.restore_height })
  }
  if (req.params.type === 'bitcoin') {
    const s = await asbRpc('bitcoin_seed')
    return res.json({ descriptor: s.descriptor })
  }
  res.status(400).json({ error: 'Unknown seed type' })
}))

// ---- Full recovery backup ---------------------------------------------------
// Streams a tar.gz of everything needed to fully restore the node and recover
// stuck swaps: the master seed (BTC + identity), the INDEPENDENT Monero wallet
// (XMR), the swap database (sqlite), the Bitcoin wallet, and the Tor onion key.
// Caches/logs/secrets are excluded (regenerable). Optionally AES-256-GCM
// encrypted with a user passphrase (format: "SABK1" | salt(16) | iv(12) |
// tag(16) | ciphertext).
app.post('/api/backup', requireAuth, asyncHandler(async (req, res) => {
  const { password, passphrase } = req.body || {}
  if (typeof password !== 'string' || !bcrypt.compareSync(password, readHash())) {
    return res.status(401).json({ error: 'Password confirmation failed' })
  }
  const candidates = ['seed.pem', 'monero/wallets', 'sqlite', 'wallet', 'tor/state', 'withdrawals.json', 'ui-settings.json']
  const paths = candidates.filter(p => fs.existsSync(path.join(DATA_DIR, p)))
  if (paths.length === 0) return res.status(503).json({ error: 'Nothing to back up yet' })

  const tar = spawn('tar', ['czf', '-', '-C', DATA_DIR, ...paths])
  const chunks = []
  tar.stdout.on('data', c => chunks.push(c))
  tar.stderr.on('data', () => {})
  tar.on('error', e => { if (!res.headersSent) res.status(500).json({ error: 'backup failed: ' + e.message }) })
  tar.on('close', code => {
    if (code !== 0) { if (!res.headersSent) res.status(500).json({ error: 'backup failed' }); return }
    let body = Buffer.concat(chunks)
    const date = new Date().toISOString().slice(0, 10)
    let name = `superatomic-backup-${date}.tar.gz`
    if (typeof passphrase === 'string' && passphrase.length > 0) {
      const salt = crypto.randomBytes(16)
      const iv = crypto.randomBytes(12)
      const key = crypto.scryptSync(passphrase, salt, 32)
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
      const enc = Buffer.concat([cipher.update(body), cipher.final()])
      body = Buffer.concat([Buffer.from('SABK1'), salt, iv, cipher.getAuthTag(), enc])
      name += '.enc'
    }
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`)
    res.setHeader('Content-Length', body.length)
    res.end(body)
  })
}))

// ---- Restore from a backup --------------------------------------------------
// Accepts a backup archive produced by /api/backup (optionally AES-256-GCM
// encrypted), decrypts it, validates its contents against a whitelist, stops
// the ASB, extracts over the data dir, and starts the ASB again so it loads the
// restored wallets. The dashboard password rides in a header (the body is the
// raw archive); the decryption passphrase, if any, rides in another header.
const RESTORE_ALLOWED = ['seed.pem', 'monero', 'sqlite', 'wallet', 'tor', 'withdrawals.json', 'ui-settings.json']
app.post('/api/restore', requireAuth, express.raw({ type: () => true, limit: '512mb' }), asyncHandler(async (req, res) => {
  // Credentials ride in headers (base64 so any character survives HTTP headers).
  const b64 = h => (typeof h === 'string' && h ? Buffer.from(h, 'base64').toString('utf8') : '')
  const password = b64(req.headers['x-dashboard-password'])
  const passphrase = b64(req.headers['x-backup-passphrase'])
  if (!password || !bcrypt.compareSync(password, readHash())) {
    return res.status(401).json({ error: 'Password confirmation failed' })
  }
  let data = req.body
  if (!Buffer.isBuffer(data) || data.length === 0) {
    return res.status(400).json({ error: 'No backup file received' })
  }

  // Decrypt if the file carries our "SABK1" header.
  const MAGIC = Buffer.from('SABK1')
  if (data.length >= 5 && data.subarray(0, 5).equals(MAGIC)) {
    if (!passphrase) return res.status(400).json({ error: 'This backup is encrypted. Enter its passphrase.' })
    try {
      const salt = data.subarray(5, 21)
      const iv = data.subarray(21, 33)
      const tag = data.subarray(33, 49)
      const enc = data.subarray(49)
      const key = crypto.scryptSync(passphrase, salt, 32)
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
      decipher.setAuthTag(tag)
      data = Buffer.concat([decipher.update(enc), decipher.final()])
    } catch {
      return res.status(400).json({ error: 'Wrong passphrase, or the backup file is corrupt' })
    }
  }

  // Must now be a gzip stream (0x1f 0x8b). A plaintext .enc opened with no/blank
  // passphrase, or a truncated file, fails here rather than mangling live data.
  if (data.length < 2 || data[0] !== 0x1f || data[1] !== 0x8b) {
    return res.status(400).json({ error: 'This does not look like a SuperAtomic backup (or the passphrase is wrong)' })
  }

  // Refuse anything that is not one of our known top-level entries, that tries
  // to escape the data dir, or that is a symlink/hardlink (either could redirect
  // extraction outside /data), before we touch a single live file.
  let listing
  try { listing = await tarList(data) } catch (e) { return res.status(400).json({ error: 'Could not read the archive: ' + e.message }) }
  const bad = listing.find(entry => {
    if (entry.type === 'l' || entry.type === 'h') return true
    const clean = entry.name.replace(/^\.\//, '')
    const top = clean.split('/')[0]
    return clean.startsWith('/') || clean.split('/').includes('..') || !RESTORE_ALLOWED.includes(top)
  })
  if (bad) return res.status(400).json({ error: `Refusing to restore: unexpected entry "${bad.name}"` })

  // Stop the ASB so wallet/sqlite files are not open, restore, then start it.
  try { await sh(`${SUPERVISORCTL} stop asb`) } catch (e) { return res.status(500).json({ error: 'Could not stop the ASB before restoring: ' + e.message }) }
  try {
    await tarExtract(data, DATA_DIR)
  } catch (e) {
    await sh(`${SUPERVISORCTL} start asb`).catch(() => {})
    return res.status(500).json({ error: 'Restore failed while extracting: ' + e.message })
  }
  await sh(`${SUPERVISORCTL} start asb`).catch(() => {})
  res.json({ ok: true, restored: listing.length, message: 'Backup restored. The ASB is restarting and will rescan your wallets.' })
}))

// ---- Static frontend --------------------------------------------------------
app.use(express.static(path.join(__dirname, '../frontend/dist')))
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, '../frontend/dist/index.html')))

const PORT = process.env.PORT || 8081
app.listen(PORT, '127.0.0.1', () => console.log(`ASB dashboard listening on ${PORT}`))
