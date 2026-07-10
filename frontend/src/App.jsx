import React, { useEffect, useState } from 'react'
import Dashboard from './Dashboard.jsx'
import Login from './Login.jsx'
import Setup from './Setup.jsx'

const API = '/api'

function App() {
  const [token, setToken] = useState(localStorage.getItem('superatomic_token'))
  const [state, setState] = useState({ loading: true, passwordSet: false, ok: false })

  useEffect(() => {
    let cancelled = false
    async function init() {
      let passwordSet = false
      try {
        const s = await fetch(`${API}/auth/status`).then(r => r.json())
        passwordSet = !!s.passwordSet
      } catch { /* keep default */ }

      let ok = false
      if (token) {
        try {
          ok = (await fetch(`${API}/auth/check`, { headers: { Authorization: `Bearer ${token}` } })).ok
        } catch { ok = false }
        if (!ok) localStorage.removeItem('superatomic_token')
      }
      if (!cancelled) setState({ loading: false, passwordSet, ok })
    }
    init()
    return () => { cancelled = true }
  }, [token])

  function onAuthed(t) {
    localStorage.setItem('superatomic_token', t)
    setToken(t)
    setState(s => ({ ...s, loading: false, passwordSet: true, ok: true }))
  }
  function onLogout() {
    localStorage.removeItem('superatomic_token')
    setToken(null)
    setState(s => ({ ...s, ok: false }))
  }

  if (state.loading) return <div className="loading">Loading...</div>
  if (!state.ok) {
    return state.passwordSet
      ? <Login onAuthed={onAuthed} />
      : <Setup onAuthed={onAuthed} />
  }
  return <Dashboard token={token} onLogout={onLogout} />
}

export default App
