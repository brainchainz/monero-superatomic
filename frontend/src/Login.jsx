import React, { useState } from 'react'

function Login({ onAuthed }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      })
      const j = await r.json()
      if (r.ok && j.token) onAuthed(j.token)
      else setError(j.error || 'Login failed')
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
        <p>Automated XMR liquidity backend</p>
        <form onSubmit={submit}>
          <label>Dashboard Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoFocus />
          {error && <div className="error">{error}</div>}
          <button type="submit" disabled={loading || !password}>{loading ? 'Unlocking...' : 'Unlock'}</button>
        </form>
      </div>
    </div>
  )
}

export default Login
