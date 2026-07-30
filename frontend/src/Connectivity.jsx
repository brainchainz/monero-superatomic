import React, { useEffect, useState } from 'react'
import { copyText } from './clipboard.js'
import { Secret } from './privacy.jsx'

const REG_LABELS = {
  Registered: 'Registered',
  WillRegisterAfterDelay: 'Retrying soon',
  RegisterOnceConnected: 'Waiting for connection',
  RequestInflight: 'Registering...'
}

// Shows the maker's peer id and how reachable it is on the rendezvous network,
// so the operator can confirm takers can find them.
function Connectivity({ api }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let t
    async function poll() {
      try {
        const d = await api('/connectivity')
        if (d) { setData(d); setError('') }
      } catch (e) { setError(e.message) }
      t = setTimeout(poll, 10000)
    }
    poll()
    return () => clearTimeout(t)
  }, [api])

  function copyPeer() {
    if (!data?.peerId) return
    copyText(data.peerId)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (error) return <div className="card"><div className="error">{error}</div></div>
  if (!data) return <div className="card">Loading connectivity...</div>

  const registered = (data.registrations || []).filter(r => r.registration === 'Registered').length
  const total = (data.registrations || []).length

  return (
    <>
      <div className="card">
        <div className="card-title">Your Peer ID</div>
        <div className="address mono"><Secret value={data.peerId} /></div>
        <div className="button-row">
          <button onClick={copyPeer}>{copied ? 'Copied' : 'Copy peer id'}</button>
        </div>
        <div className="grid-3" style={{ marginTop: 16 }}>
          <div><div className="label">Active connections</div><div className="value">{data.connections}</div></div>
          <div><div className="label">Rendezvous registered</div><div className="value">{registered}/{total}</div></div>
          <div><div className="label">Tor onion</div><div className="value">{data.onion ? (data.onion.reachable ? 'Reachable' : 'Starting') : 'n/a'}</div></div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Rendezvous Network</div>
        {total === 0 && <div className="muted">No rendezvous points configured.</div>}
        {(data.registrations || []).map((r, i) => (
          <div className="flex-between swap-row" key={i}>
            <span className="mono" style={{ fontSize: 12 }}>{r.address || 'unknown'}</span>
            <span className={`pill ${r.registration === 'Registered' ? 'ok' : 'bad'}`}>
              {REG_LABELS[r.registration] || r.registration}
            </span>
          </div>
        ))}
      </div>

      {data.multiaddresses?.length > 0 && (
        <div className="card">
          <div className="card-title">Your Addresses</div>
          {data.multiaddresses.map((a, i) => <div className="mono" style={{ fontSize: 12, marginBottom: 4 }} key={i}><Secret value={a} /></div>)}
        </div>
      )}
    </>
  )
}

export default Connectivity
