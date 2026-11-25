import React, { useEffect, useState } from 'react'
import { Secret } from './privacy.jsx'

function Quote({ api }) {
  const [q, setQ] = useState(null)

  useEffect(() => {
    let t
    async function poll() {
      // try/catch so one failed request (asb restarting) can't kill the loop.
      try {
        const d = await api('/quote')
        if (d) setQ(d)
      } catch { /* keep last quote, retry next tick */ }
      t = setTimeout(poll, 15000)
    }
    poll()
    return () => clearTimeout(t)
  }, [api])

  if (!q) return null

  // Engine 5.0.4+ raises the quoted minimum above min_buy_btc when a smaller
  // swap could not pay for its refund path. Compare in sats to avoid float noise.
  const raised = q.configured_min != null &&
    Math.round(q.min_quantity * 1e8) > Math.round(q.configured_min * 1e8)

  return (
    <div className="card quote">
      <div className="card-title">Current Offer</div>
      <div className="grid-4">
        <div><div className="label">Price</div><div className="value"><Secret value={`${q.price} BTC / XMR`} /></div></div>
        <div>
          <div className="label">Spread</div>
          <div className="value"><Secret value={q.spread != null ? `${q.spread}%` : 'n/a'} /></div>
        </div>
        <div>
          <div className="label">Min</div>
          <div className="value"><Secret value={`${q.min_quantity} BTC`} /></div>
          {raised && (
            <div className="muted" style={{ fontSize: '0.8em' }}
              title={`Configured minimum is ${q.configured_min} BTC. The swap engine quotes a higher minimum so every swap it offers can still pay for its refund path.`}>
              Raised by engine so refunds stay affordable (config: <Secret value={`${q.configured_min} BTC`} />)
            </div>
          )}
        </div>
        <div><div className="label">Max</div><div className="value"><Secret value={`${q.max_quantity} BTC`} /></div></div>
      </div>
    </div>
  )
}

export default Quote
