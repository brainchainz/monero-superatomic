import React, { useEffect, useRef, useState } from 'react'

const fmt = (n, d = 8) => Number(n || 0).toFixed(d)

// Helps you decide your spread and Max BTC per swap from how much XMR you hold.
// You set the values yourself in the Config tab; this just shows the numbers.
function Planner({ api, onApply }) {
  const [xmr, setXmr] = useState('')
  const [spread, setSpread] = useState('2') // percent
  const [market, setMarket] = useState('') // BTC per XMR
  const [note, setNote] = useState('')
  const loaded = useRef(false) // load once so it never wipes what you type

  useEffect(() => {
    if (loaded.current) return
    loaded.current = true
    ;(async () => {
      const [bal, cfg] = await Promise.all([api('/balances').catch(() => null), api('/config').catch(() => null)])
      if (bal && bal.monero) setXmr(String(bal.monero.unlocked ?? bal.monero.balance ?? ''))
      let cur = 0.02
      if (cfg && cfg.config && cfg.config.maker) {
        cur = Number(cfg.config.maker.ask_spread) || 0.02
        setSpread(String(+(cur * 100).toFixed(4)))
      }
      const q = await api('/quote').catch(() => null)
      if (q && q.price) {
        setMarket(String(+(q.price / (1 + cur)).toFixed(8)))
        setNote('Market price derived from the ASB\'s live quote.')
      } else {
        setNote('ASB offline — enter the current market XMR price (in BTC) manually.')
      }
    })()
  }, [api])

  async function useAvailable() {
    try {
      const bal = await api('/balances')
      if (bal && bal.monero) setXmr(String(bal.monero.unlocked ?? bal.monero.balance ?? ''))
    } catch { /* asb offline; leave the field as typed */ }
  }

  const x = Number(xmr) || 0
  const s = (Number(spread) || 0) / 100
  const m = Number(market) || 0
  const ask = m * (1 + s)
  const btcAll = x * ask
  const earn = x * m * s
  const devtip = x * m * 0.01

  return (
    <div className="card">
      <div className="card-title">Liquidity Planner</div>
      <p className="muted">See what your Monero earns at a given spread, then set your spread and Max BTC per swap in the Config tab.</p>

      <div className="grid-2">
        <div>
          <label>Available XMR</label>
          <input value={xmr} onChange={e => setXmr(e.target.value)} inputMode="decimal" />
          <button type="button" className="secondary" style={{ marginTop: '-4px', marginBottom: 12 }} onClick={useAvailable}>
            Use available balance
          </button>
        </div>
        <div>
          <label>Market price (BTC per XMR)</label>
          <input value={market} onChange={e => setMarket(e.target.value)} inputMode="decimal" />
        </div>
      </div>

      <label>Spread: {spread || 0}%</label>
      <input type="range" min="0" max="10" step="0.1" value={spread} onChange={e => setSpread(e.target.value)} style={{ padding: 0 }} />
      <input value={spread} onChange={e => setSpread(e.target.value)} inputMode="decimal" />
      {note && <div className="muted" style={{ marginBottom: 12 }}>{note}</div>}

      <div className="seed-box">
        <div className="grid-3">
          <div><div className="label">Your ask price</div><div className="value">{fmt(ask)} BTC/XMR</div></div>
          <div><div className="label">If all {fmt(x, 4)} XMR swaps</div><div className="value">{fmt(btcAll)} BTC</div></div>
          <div><div className="label">Spread earnings</div><div className="value">{fmt(earn)} BTC</div></div>
        </div>
        <div className="grid-3" style={{ marginTop: 14 }}>
          <div><div className="label">1% dev tip (in XMR value)</div><div className="value">{fmt(devtip)} BTC</div></div>
          <div><div className="label">Suggested Max BTC / swap</div><div className="value">{fmt(btcAll)} BTC</div></div>
          <div></div>
        </div>
      </div>

      <p className="muted">
        Set <b>Max BTC per swap</b> at or below <b>{fmt(btcAll)} BTC</b> so a single swap never
        exceeds your XMR. Prices move, but the ASB automatically re-caps its offer to your live
        balance and rate, so you do not need to keep updating this.
      </p>

      {onApply && (
        <div className="button-row">
          <button
            onClick={() => onApply({ ask_spread: +(Number(spread) || 0).toFixed(4), max_buy_btc: +Number(btcAll).toFixed(8) })}
            disabled={!(btcAll > 0)}
          >
            Apply to Config
          </button>
          <span className="muted">Fills the spread and Max BTC in the Config tab. Nothing changes until you review and Save there.</span>
        </div>
      )}
    </div>
  )
}

export default Planner
