import React, { useCallback, useEffect, useState } from 'react'
import Balances from './Balances.jsx'
import Funding from './Funding.jsx'
import Planner from './Planner.jsx'
import Swaps from './Swaps.jsx'
import Quote from './Quote.jsx'
import Withdraw from './Withdraw.jsx'
import Connectivity from './Connectivity.jsx'
import ConfigEditor from './ConfigEditor.jsx'
import Logs from './Logs.jsx'
import Seeds from './Seeds.jsx'
import HowTo from './HowTo.jsx'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'funding', label: 'Funding' },
  { id: 'planner', label: 'Planner' },
  { id: 'withdraw', label: 'Withdraw' },
  { id: 'network', label: 'Network' },
  { id: 'config', label: 'Config' },
  { id: 'seeds', label: 'Backup' },
  { id: 'logs', label: 'Logs' },
  { id: 'howto', label: 'How-To' }
]

function Dashboard({ token, onLogout }) {
  const [tab, setTab] = useState('overview')
  const [status, setStatus] = useState(null)
  const [error, setError] = useState('')
  const [pendingCfg, setPendingCfg] = useState(null) // settings handed from the Planner to Config
  const [uiSettings, setUiSettings] = useState({}) // explorer URLs etc. (/data/ui-settings.json)

  function applyToConfig(vals) {
    setPendingCfg(vals)
    setTab('config')
  }

  // Stable identity across the 5s status poll so children that fetch on mount
  // (Config, Planner) don't refetch and wipe what the user is typing.
  const api = useCallback(async (path, opts = {}) => {
    const r = await fetch(`/api${path}`, {
      ...opts,
      headers: { ...opts.headers, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    })
    if (r.status === 401) { onLogout(); return }
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
    return j
  }, [token, onLogout])

  useEffect(() => {
    let t
    async function poll() {
      try {
        const s = await api('/status')
        if (s) setStatus(s)
        setError('')
      } catch (e) {
        setError(e.message)
      }
      t = setTimeout(poll, 5000)
    }
    poll()
    return () => clearTimeout(t)
  }, [token])

  useEffect(() => {
    api('/ui-settings').then(s => { if (s) setUiSettings(s) }).catch(() => {})
  }, [api])

  return (
    <div className="dashboard">
      <header>
        <div className="brand">
          <img className="logo" src="/logo.png" alt="Monero SuperAtomic" />
          <div>
            <h1>Monero SuperAtomic</h1>
            <div className="subtitle">Automated XMR Liquidity</div>
          </div>
        </div>
        <div className="header-right">
          {status && (
            <div className={`pill ${status.asbConnected ? 'ok' : 'bad'}`}>
              {status.asbConnected ? 'ASB Online' : 'ASB Offline'}
            </div>
          )}
          <button className="logout" onClick={onLogout}>Lock</button>
        </div>
      </header>

      <nav className="tabs">
        {TABS.map(t => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </nav>

      {error && <div className="banner error">{error}</div>}

      <main>
        {tab === 'overview' && (
          <>
            <div className="hero">
              <video autoPlay loop muted playsInline className="hero-vid">
                <source src="/swap.webm" type="video/webm" />
                <source src="/swap.mp4" type="video/mp4" />
              </video>
            </div>
            <Balances api={api} />
            <Quote api={api} />
            <Swaps api={api} explorers={uiSettings} />
          </>
        )}
        {tab === 'funding' && <Funding api={api} />}
        {tab === 'planner' && <Planner api={api} onApply={applyToConfig} />}
        {tab === 'withdraw' && <Withdraw api={api} explorers={uiSettings} />}
        {tab === 'network' && <Connectivity api={api} />}
        {tab === 'config' && <ConfigEditor api={api} pending={pendingCfg} onPendingConsumed={() => setPendingCfg(null)} explorers={uiSettings} onExplorersSaved={setUiSettings} />}
        {tab === 'seeds' && <Seeds api={api} token={token} />}
        {tab === 'logs' && <Logs api={api} />}
        {tab === 'howto' && <HowTo />}
      </main>
    </div>
  )
}

export default Dashboard
