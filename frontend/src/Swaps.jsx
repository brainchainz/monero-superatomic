import React, { useEffect, useState } from 'react'
import Txid from './Txid.jsx'
import { btcTxUrl } from './explorers.js'

// Happy-path phase order, normalized (lowercase, alphanumerics only) so it
// matches the ASB's AliceState names regardless of formatting. The maker (Alice)
// locks XMR, then redeems the counterparty's BTC.
const PHASES = [
  'started',
  'btclocktransactionseen',
  'btclocked',
  'xmrlocktransactionconstructed',
  'xmrlocktransactionsent',
  'xmrlocked',
  'xmrlocktransferproofsent',
  'btcredeemtransactionpublished',
  'btcredeemed'
]

// Terminal states that did not complete the happy path (refund/cancel/punish).
const FAILUREISH = ['cancel', 'refund', 'punish']

const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

function progress(state) {
  const n = norm(state)
  const idx = PHASES.indexOf(n)
  if (idx >= 0) return Math.round((idx / (PHASES.length - 1)) * 100)
  // Unknown/terminal states: full bar if it looks like an end state.
  if (FAILUREISH.some(k => n.includes(k)) || n.includes('redeemed')) return 100
  return 0
}

// "BtcRedeemTransactionPublished" -> "Btc Redeem Transaction Published"
function humanize(state) {
  if (!state) return 'Unknown'
  return state.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ')
}

function isFailure(state) {
  return FAILUREISH.some(k => norm(state).includes(k))
}

const fmtBtc = sats => (Number(sats) / 1e8).toFixed(8) + ' BTC'
const fmtXmr = pico => (Number(pico) / 1e12).toFixed(6) + ' XMR'

function Swaps({ api, explorers }) {
  const [swaps, setSwaps] = useState([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const d = await api('/swaps')
      if (d && Array.isArray(d.swaps)) setSwaps(d.swaps)
    } finally {
      setLoading(false)
    }
  }

  // Poll so an in-progress swap advances through its phases live.
  useEffect(() => {
    load()
    const i = setInterval(load, 5000)
    return () => clearInterval(i)
  }, [api])

  return (
    <div className="card">
      <div className="card-title flex-between">
        <span>Active and Historical Swaps</span>
        <button onClick={load} disabled={loading}>{loading ? 'Refreshing...' : 'Refresh'}</button>
      </div>
      {swaps.length === 0 && <div className="muted">No swaps yet. Swaps appear here and advance through their phases as they progress.</div>}
      <div className="swaps-list">
        {swaps.map(swap => {
          const pct = progress(swap.state)
          const failed = isFailure(swap.state)
          return (
            <div key={swap.swap_id} className="swap-row">
              <div className="swap-head">
                <span className="swap-id" title={swap.swap_id}>{swap.swap_id.slice(0, 8)}...</span>
                <span className={`state ${swap.completed ? (failed ? 'bad' : 'done') : 'open'}`}>{humanize(swap.state)}</span>
                <span className="date">{swap.start_date}</span>
              </div>
              <div className="swap-bar">
                <div className="swap-bar-fill" style={{ width: `${pct}%`, background: failed ? 'var(--bad)' : undefined }} />
              </div>
              <div className="swap-details">
                <span>BTC: {fmtBtc(swap.btc_amount)}</span>
                <span>XMR: {fmtXmr(swap.xmr_amount)}</span>
                <span>Rate: {fmtBtc(swap.exchange_rate)}/XMR</span>
              </div>
              {swap.btc_lock_txid && <Txid label="Lock" txid={swap.btc_lock_txid} url={btcTxUrl(swap.btc_lock_txid, explorers)} />}
              {swap.btc_redeem_txid && <Txid label="Redeem" txid={swap.btc_redeem_txid} url={btcTxUrl(swap.btc_redeem_txid, explorers)} />}
              {swap.btc_punish_txid && <Txid label="Punish" txid={swap.btc_punish_txid} url={btcTxUrl(swap.btc_punish_txid, explorers)} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default Swaps
