import React, { useEffect, useState } from 'react'

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

  return (
    <div className="card quote">
      <div className="card-title">Current Offer</div>
      <div className="grid-3">
        <div><div className="label">Price</div><div className="value">{q.price} BTC / XMR</div></div>
        <div><div className="label">Min</div><div className="value">{q.min_quantity} BTC</div></div>
        <div><div className="label">Max</div><div className="value">{q.max_quantity} BTC</div></div>
      </div>
    </div>
  )
}

export default Quote
