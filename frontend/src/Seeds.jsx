import React, { useState } from 'react'

function Seeds({ api, token }) {
  const [seed, setSeed] = useState(null)
  const [pass, setPass] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [pwMsg, setPwMsg] = useState('')
  const [restoreFile, setRestoreFile] = useState(null)
  const [restorePass, setRestorePass] = useState('')
  const [restoreAck, setRestoreAck] = useState(false)
  const [restoreMsg, setRestoreMsg] = useState('')
  const [restoreBusy, setRestoreBusy] = useState(false)

  const b64 = s => btoa(unescape(encodeURIComponent(s || '')))

  async function restore() {
    setRestoreMsg('')
    if (!pass) return setRestoreMsg('Enter your dashboard password above first')
    if (!restoreFile) return setRestoreMsg('Choose a backup file to restore')
    if (!restoreAck) return setRestoreMsg('Tick the confirmation box to proceed')
    setRestoreBusy(true)
    try {
      const buf = await restoreFile.arrayBuffer()
      const r = await fetch('/api/restore', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/octet-stream',
          'X-Dashboard-Password': b64(pass),
          'X-Backup-Passphrase': b64(restorePass)
        },
        body: buf
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setRestoreMsg(j.message || 'Backup restored.')
      setRestoreFile(null); setRestoreAck(false)
    } catch (e) { setRestoreMsg('Error: ' + e.message) }
    finally { setRestoreBusy(false) }
  }

  async function changePassword() {
    setPwMsg('')
    if (newPw.length < 8) return setPwMsg('New password must be at least 8 characters')
    try {
      const d = await api('/auth/change', { method: 'POST', body: JSON.stringify({ oldPassword: oldPw, newPassword: newPw }) })
      if (d && d.token) localStorage.setItem('superatomic_token', d.token)
      setOldPw(''); setNewPw(''); setPwMsg('Password changed.')
    } catch (e) { setPwMsg('Error: ' + e.message) }
  }

  async function reveal(type) {
    setError('')
    try {
      const d = await api(`/seeds/${type}`, { method: 'POST', body: JSON.stringify({ password: pass }) })
      if (d) setSeed({ type, ...d })
    } catch (e) { setError(e.message) }
  }

  async function downloadBackup() {
    setError('')
    if (!pass) return setError('Enter your dashboard password first')
    setBusy(true)
    try {
      const r = await fetch('/api/backup', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pass, passphrase: passphrase || undefined })
      })
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `HTTP ${r.status}`) }
      const blob = await r.blob()
      const cd = r.headers.get('Content-Disposition') || ''
      const name = (cd.match(/filename="([^"]+)"/) || [])[1] || 'superatomic-backup.tar.gz'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  return (
    <>
      <div className="card">
        <div className="card-title">Backup &amp; Recovery</div>
        <p className="warning">Anything here can move all of your funds. Store backups offline and never share them.</p>
        <p className="muted">
          Two separate keys secure this node. The <b>Monero seed</b> recovers your XMR, and it is
          <b> not</b> derived from the Bitcoin key. The <b>Bitcoin descriptor</b> (from the master
          seed) recovers your BTC. The full backup below also includes the <b>swap database</b>,
          which is required to recover a swap that gets stuck mid-flight.
        </p>
        <label>Confirm dashboard password</label>
        <input type="password" value={pass} onChange={e => setPass(e.target.value)} />
        {error && <div className="error">{error}</div>}
      </div>

      <div className="card">
        <div className="card-title">Full backup (recommended)</div>
        <p className="muted">
          Downloads seed.pem, the Monero wallet, the swap database, the Bitcoin wallet, and the Tor
          onion key as a single .tar.gz. Restore it to bring the whole node (and any in-progress
          swaps) back. Optionally encrypt it with a passphrase you will need to restore.
        </p>
        <label>Backup passphrase (optional, encrypts the file)</label>
        <input type="password" value={passphrase} onChange={e => setPassphrase(e.target.value)} placeholder="Leave empty for an unencrypted archive" />
        <div className="button-row">
          <button onClick={downloadBackup} disabled={!pass || busy}>{busy ? 'Preparing...' : 'Download full backup'}</button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Restore from a backup</div>
        <p className="warning">
          This replaces the current Monero wallet, Bitcoin wallet, node identity, and swap database
          with the ones in the backup, then restarts the ASB. Any funds or swaps on this node that
          are not in the backup will be lost. Download a fresh backup first if you are unsure.
        </p>
        <label>Backup file (.tar.gz or .tar.gz.enc)</label>
        <input type="file" accept=".gz,.enc,.tar,application/octet-stream" onChange={e => { setRestoreFile(e.target.files[0] || null); setRestoreMsg('') }} />
        <label>Backup passphrase (only if the file is encrypted)</label>
        <input type="password" value={restorePass} onChange={e => setRestorePass(e.target.value)} placeholder="Leave empty for an unencrypted backup" />
        <label className="check-row">
          <input type="checkbox" checked={restoreAck} onChange={e => setRestoreAck(e.target.checked)} />
          <span>I understand this overwrites this node's current wallets and swaps.</span>
        </label>
        {restoreMsg && <div className={restoreMsg.startsWith('Error') ? 'error' : 'banner'}>{restoreMsg}</div>}
        <div className="button-row">
          <button onClick={restore} disabled={!pass || !restoreFile || !restoreAck || restoreBusy}>{restoreBusy ? 'Restoring...' : 'Restore backup'}</button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Change dashboard password</div>
        <label>Current password</label>
        <input type="password" value={oldPw} onChange={e => setOldPw(e.target.value)} />
        <label>New password</label>
        <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} />
        {pwMsg && <div className={pwMsg.startsWith('Error') ? 'error' : 'banner'}>{pwMsg}</div>}
        <div className="button-row">
          <button onClick={changePassword} disabled={!oldPw || !newPw}>Change password</button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Reveal seeds (to restore funds elsewhere)</div>
        <div className="button-row">
          <button onClick={() => reveal('monero')} disabled={!pass}>Reveal Monero Seed</button>
          <button onClick={() => reveal('bitcoin')} disabled={!pass}>Reveal Bitcoin Descriptor</button>
        </div>
        {seed && (
          <div className="seed-box">
            <div className="seed-label">{seed.type === 'monero' ? 'Monero Seed (restores XMR in Feather/CLI)' : 'Bitcoin Descriptor (restores BTC)'}</div>
            <pre>{seed.type === 'monero' ? seed.seed : seed.descriptor}</pre>
            {seed.type === 'monero' && seed.restore_height != null && (
              <>
                <div className="seed-label">Restore Height</div>
                <pre>{seed.restore_height}</pre>
                <p className="muted">Use this restore height when importing the seed so the wallet only scans from here.</p>
              </>
            )}
          </div>
        )}
      </div>
    </>
  )
}

export default Seeds
