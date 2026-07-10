import React, { useEffect, useState } from 'react'

function Balances({ api }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    let t
    async function poll() {
      // try/catch so one failed request (asb restarting) can't kill the loop,
      // and a 5s cadence so fresh deposits show quickly.
      try {
        const d = await api('/balances')
        if (d) setData(d)
      } catch { /* keep last data, retry next tick */ }
      t = setTimeout(poll, 5000)
    }
    poll()
    return () => clearTimeout(t)
  }, [api])

  if (!data) return <div className="card">Loading balances...</div>

  const xmr = data.monero
  const pending = xmr.pending ?? 0
  const fmt = n => Number(n ?? 0).toFixed(6)
  const fmtBtc = n => Number(n ?? 0).toFixed(8)

  return (
    <div className="grid-2">
      <div className="card">
        <div className="card-title">Monero Balance</div>
        <div className="big">{fmt(xmr.balance)} XMR</div>
        <div className="grid-2" style={{ marginTop: 8, marginBottom: 8 }}>
          <div><div className="label">Available</div><div className="value">{fmt(xmr.unlocked ?? xmr.balance)}</div></div>
          <div><div className="label">Pending</div><div className="value">{fmt(pending)}{pending > 0 ? ' ⏳' : ''}</div></div>
        </div>
      </div>
      <div className="card">
        <div className="card-title">Bitcoin Balance</div>
        <div className="big">{fmtBtc(data.bitcoin.balance)} BTC</div>
        <div className="muted">Internal ASB wallet</div>
      </div>
    </div>
  )
}

export default Balances
