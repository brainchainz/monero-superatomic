import React, { createContext, useContext, useEffect, useState } from 'react'

// Privacy mode: hides identifying values so the dashboard can be screenshotted,
// screen-shared, or filmed without doxing the operator.
//
// Values are REPLACED, not blurred. A CSS blur leaves the real text in the DOM
// (visible to devtools, page source, and potentially recoverable from the
// pixels), and even a short prefix of a transaction id is enough to find it on
// a block explorer. Replacing the text is the only honest redaction.
//
// There is deliberately no hover-to-reveal: a stray mouse move is exactly the
// accident this mode exists to prevent. To read a value, turn the mode off.
// Copy buttons keep copying the real value either way.
//
// Stored per browser: this is a viewing preference, not node state, so a phone
// and a laptop need not agree, and it survives a refresh mid-recording.
const KEY = 'superatomic_privacy'

const PrivacyContext = createContext({ hidden: false, setHidden: () => {} })

export function PrivacyProvider({ children }) {
  const [hidden, setHidden] = useState(() => localStorage.getItem(KEY) === '1')
  useEffect(() => { localStorage.setItem(KEY, hidden ? '1' : '0') }, [hidden])

  return (
    <PrivacyContext.Provider value={{ hidden, setHidden }}>
      {children}
    </PrivacyContext.Provider>
  )
}

export function usePrivacy() {
  return useContext(PrivacyContext)
}

// A constant-width mask, deliberately independent of the value's length: a
// proportional mask would leak how many digits a balance has (0.5 versus
// 1000.5), which is exactly the kind of hint this mode exists to remove.
const MASK = '••••••••••'

// Wraps a sensitive value: an address, peer id, onion address, transaction id,
// or seed.
export function Secret({ value, children, className = '' }) {
  const { hidden } = usePrivacy()

  if (!hidden) return <span className={className}>{children ?? value}</span>
  return (
    <span className={`secret-masked ${className}`} title="Hidden. Click Show in the top bar to reveal.">
      {MASK}
    </span>
  )
}
