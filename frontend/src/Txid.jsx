import React, { useState } from 'react'
import { copyText } from './clipboard.js'
import { Secret } from './privacy.jsx'

// A transaction id, displayed in full: click the id to copy it, click the
// arrow to open it in the configured block explorer.
function Txid({ txid, url, label }) {
  const [copied, setCopied] = useState(false)

  function copy() {
    copyText(txid)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (!txid) return null
  return (
    <div className="txid-row">
      {label && <span className="txid-label">{label}</span>}
      {/* copy() uses the real txid, so copying works while masked */}
      <span className="txid mono" title="Click to copy" onClick={copy}><Secret value={txid} /></span>
      <span className="txid-actions">
        {copied && <span className="txid-copied">Copied</span>}
        {url && (
          <a className="txid-open" href={url} target="_blank" rel="noopener noreferrer" title="Open in block explorer">&#8599;</a>
        )}
      </span>
    </div>
  )
}

export default Txid
