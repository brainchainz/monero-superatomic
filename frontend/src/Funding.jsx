import React, { useEffect, useState } from 'react'
import { copyText } from './clipboard.js'
import { Secret } from './privacy.jsx'

// Shows the ASB's Monero address. Send XMR here to fund the liquidity the ASB
// offers for swaps.
function Funding({ api }) {
  const [address, setAddress] = useState(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let t
    async function poll() {
      try {
        const d = await api('/deposit')
        if (d) { setAddress(d.moneroAddress); setError('') }
      } catch (e) { setError(e.message) }
      t = setTimeout(poll, 15000)
    }
    poll()
    return () => clearTimeout(t)
  }, [api])

  function copy() {
    if (!address) return
    copyText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="card">
      <div className="card-title">Fund the ASB (Monero deposit)</div>
      <p className="muted">Send XMR to this address to provide swap liquidity. Funds stay in your ASB wallet until a swap is taken.</p>
      {error && <div className="error">{error}</div>}
      {!address && !error && <div className="muted">Waiting for the wallet to come online...</div>}
      {address && (
        <>
          <div className="address mono"><Secret value={address} /></div>
          <div className="button-row">
            <button onClick={copy}>{copied ? 'Copied' : 'Copy address'}</button>
          </div>
        </>
      )}
    </div>
  )
}

export default Funding
