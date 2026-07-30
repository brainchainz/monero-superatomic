import React from 'react'
import { usePrivacy } from './privacy.jsx'

// Header control for privacy mode. One button, two states: the label says what
// clicking it will do.
function PrivacyToggle() {
  const { hidden, setHidden } = usePrivacy()

  return (
    <button
      className={`privacy-btn ${hidden ? 'on' : ''}`}
      onClick={() => setHidden(!hidden)}
      title={hidden
        ? 'Addresses, peer id, transaction ids, and seeds are hidden. Click to show them.'
        : 'Hide addresses, peer id, transaction ids, and seeds for screenshots and screen sharing.'}
    >
      {hidden ? 'Show' : 'Hide'}
    </button>
  )
}

export default PrivacyToggle
