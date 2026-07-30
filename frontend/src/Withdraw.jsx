import React, { useEffect, useState } from 'react'
import Balances from './Balances.jsx'
import Txid from './Txid.jsx'
import { btcTxUrl, xmrTxUrl } from './explorers.js'
import { Secret } from './privacy.jsx'

const TYPE_LABELS = {
  'withdrawal': { text: 'Withdrawal', cls: '' },
  'swap-redeem': { text: 'Swap redeem', cls: 'in' },
  'swap-punish': { text: 'Swap punish', cls: 'bad' }
}

// Withdraw BTC from the ASB's internal Bitcoin wallet to an external address.
function Withdraw({ api, explorers }) {
  const [address, setAddress] = useState('')
  const [amount, setAmount] = useState('')
  const [sweep, setSweep] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [activity, setActivity] = useState([])
  const [xmrAddress, setXmrAddress] = useState('')
  const [xmrAmount, setXmrAmount] = useState('')
  const [xmrSweep, setXmrSweep] = useState(false)
  const [xmrPassword, setXmrPassword] = useState('')
  const [xmrBusy, setXmrBusy] = useState(false)
  const [xmrError, setXmrError] = useState('')
  const [xmrResult, setXmrResult] = useState(null)
  const [xmrHistory, setXmrHistory] = useState([])

  async function loadActivity() {
    try {
      const d = await api('/activity')
      if (d && Array.isArray(d.items)) setActivity(d.items)
    } catch { /* asb restarting; keep last list */ }
    try {
      const h = await api('/monero-history')
      if (h && Array.isArray(h.transactions)) setXmrHistory(h.transactions)
    } catch { /* asb restarting; keep last list */ }
  }

  useEffect(() => {
    loadActivity()
    const i = setInterval(loadActivity, 15000)
    return () => clearInterval(i)
  }, [api])

  async function submitXmr(e) {
    e.preventDefault()
    setXmrError('')
    setXmrResult(null)
    if (!xmrAddress.trim()) return setXmrError('Enter a Monero address')
    if (!xmrSweep && !(Number(xmrAmount) > 0)) return setXmrError('Enter an amount or choose sweep')
    if (!xmrPassword) return setXmrError('Confirm your dashboard password')
    setXmrBusy(true)
    try {
      const body = { address: xmrAddress.trim(), password: xmrPassword, ...(xmrSweep ? { sweep: true } : { amount: Number(xmrAmount) }) }
      const d = await api('/withdraw-xmr', { method: 'POST', body: JSON.stringify(body) })
      if (d) { setXmrResult(d); setXmrPassword(''); loadActivity() }
    } catch (e) { setXmrError(e.message) }
    finally { setXmrBusy(false) }
  }

  async function submit(e) {
    e.preventDefault()
    setError('')
    setResult(null)
    if (!address.trim()) return setError('Enter a Bitcoin address')
    if (!sweep && !(Number(amount) > 0)) return setError('Enter an amount or choose "Send entire balance"')
    if (!password) return setError('Confirm your dashboard password')
    setBusy(true)
    try {
      const body = { address: address.trim(), password, ...(sweep ? { sweep: true } : { amount: Number(amount) }) }
      const d = await api('/withdraw', { method: 'POST', body: JSON.stringify(body) })
      if (d) { setResult(d); setPassword(''); loadActivity() }
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  return (
    <>
      <Balances api={api} />
      <div className="card">
        <div className="card-title">Withdraw Bitcoin</div>
        <p className="muted">Send BTC from the ASB's internal Bitcoin wallet to an external wallet.</p>
        <form onSubmit={submit}>
          <label>Destination Bitcoin address</label>
          <input value={address} onChange={e => setAddress(e.target.value)} placeholder="bc1..." />
          <label>Amount (BTC)</label>
          <input value={amount} onChange={e => setAmount(e.target.value)} disabled={sweep} placeholder="0.001" inputMode="decimal" />
          <label className="flex-between" style={{ cursor: 'pointer' }}>
            <span>Send entire balance (sweep)</span>
            <input type="checkbox" checked={sweep} onChange={e => setSweep(e.target.checked)} style={{ width: 'auto' }} />
          </label>
          <label>Confirm dashboard password (moving funds requires it)</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
          {error && <div className="error">{error}</div>}
          <div className="button-row">
            <button type="submit" disabled={busy || !password}>{busy ? 'Broadcasting...' : 'Withdraw'}</button>
          </div>
        </form>
        {result && (
          <div className="seed-box">
            <div className="seed-label">Withdrawal broadcast ({result.amount} BTC)</div>
            <Txid txid={result.txid} url={btcTxUrl(result.txid, explorers)} />
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">Bitcoin activity</div>
        <p className="muted">
          Withdrawals you broadcast from here plus swap redeem and punish transactions. The ASB
          exposes no full wallet history, so direct deposits to the internal wallet do not appear.
        </p>
        {activity.length === 0 && <div className="muted">No Bitcoin activity yet.</div>}
        {activity.map((a, i) => {
          const t = TYPE_LABELS[a.type] || { text: a.type, cls: '' }
          return (
            <div className="activity-row" key={`${a.txid}-${i}`}>
              <div className="activity-head">
                <span className={`activity-type ${t.cls}`}>{t.text}</span>
                <span><Secret value={Number(a.amount).toFixed(8)} /> BTC</span>
                {a.address && <span className="muted">to <Secret value={a.address.slice(0, 16) + '...'} /></span>}
                <span className="activity-date"><Secret value={a.ts} /></span>
              </div>
              <Txid txid={a.txid} url={btcTxUrl(a.txid, explorers)} />
            </div>
          )
        })}
      </div>

      <div className="card">
        <div className="card-title">Withdraw Monero</div>
        <p className="muted">
          Send XMR from the maker's wallet to an external wallet, to lower your liquidity or as an
          emergency exit to cold storage. Refused while a swap is in flight (that XMR is committed
          to the protocol until the swap completes). Your seed in the Backup tab remains the
          full-custody fallback.
        </p>
        <form onSubmit={submitXmr}>
          <label>Destination Monero address</label>
          <input value={xmrAddress} onChange={e => setXmrAddress(e.target.value)} placeholder="4... or 8..." />
          <label>Amount (XMR)</label>
          <input value={xmrAmount} onChange={e => setXmrAmount(e.target.value)} disabled={xmrSweep} placeholder="0.1" inputMode="decimal" />
          <label className="flex-between" style={{ cursor: 'pointer' }}>
            <span>Send entire unlocked balance (sweep)</span>
            <input type="checkbox" checked={xmrSweep} onChange={e => setXmrSweep(e.target.checked)} style={{ width: 'auto' }} />
          </label>
          <label>Confirm dashboard password (moving funds requires it)</label>
          <input type="password" value={xmrPassword} onChange={e => setXmrPassword(e.target.value)} autoComplete="current-password" />
          {xmrError && <div className="error">{xmrError}</div>}
          <div className="button-row">
            <button type="submit" disabled={xmrBusy || !xmrPassword}>{xmrBusy ? 'Broadcasting...' : 'Withdraw XMR'}</button>
          </div>
        </form>
        {xmrResult && (
          <div className="seed-box">
            <div className="seed-label">Withdrawal broadcast ({Number(xmrResult.amount).toFixed(6)} XMR)</div>
            <Txid txid={xmrResult.txid} url={xmrTxUrl(xmrResult.txid, explorers)} />
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">Monero activity</div>
        <p className="muted">Deposits and withdrawals from the maker's Monero wallet.</p>
        {xmrHistory.length === 0 && <div className="muted">No Monero activity yet.</div>}
        {xmrHistory.map((t, i) => (
          <div className="activity-row" key={`${t.txid}-${i}`}>
            <div className="activity-head">
              <span className={`activity-type ${t.direction === 'In' ? 'in' : ''}`}>{t.direction === 'In' ? 'Received' : 'Sent'}</span>
              <span><Secret value={Number(t.amount).toFixed(6)} /> XMR</span>
              <span className="muted">{t.confirmations} conf</span>
              <span className="activity-date"><Secret value={t.timestamp ? new Date(t.timestamp * 1000).toISOString().slice(0, 16).replace('T', ' ') : ''} /></span>
            </div>
            <Txid txid={t.txid} url={xmrTxUrl(t.txid, explorers)} />
          </div>
        ))}
      </div>
    </>
  )
}

export default Withdraw
