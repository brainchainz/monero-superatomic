import React, { useState } from 'react'

// Shown on first launch: the operator chooses their own dashboard password.
function Setup({ onAuthed }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 8) return setError('Password must be at least 8 characters')
    if (password !== confirm) return setError('Passwords do not match')
    setLoading(true)
    try {
      const r = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      })
      const j = await r.json()
      if (r.ok && j.token) onAuthed(j.token)
      else setError(j.error || 'Setup failed')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>Monero SuperAtomic</h1>
        <p>Create a dashboard password</p>
        <form onSubmit={submit}>
          <label>New Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoFocus />
          <label>Confirm Password</label>
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} />
          {error && <div className="error">{error}</div>}
          <button type="submit" disabled={loading || !password}>{loading ? 'Saving...' : 'Set Password'}</button>
        </form>
        <p className="muted">You are already protected by your Umbrel login. This adds a second password for this dashboard and its sensitive actions.</p>
      </div>
    </div>
  )
}

export default Setup
