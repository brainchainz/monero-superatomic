// Copy text to the clipboard. navigator.clipboard only exists in a secure
// context (HTTPS or localhost); Umbrel serves this app over plain http, so we
// fall back to a temporary textarea + execCommand there.
export function copyText(text) {
  if (!text) return false
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text))
    return true
  }
  return fallbackCopy(text)
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.top = '-1000px'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  let ok = false
  try { ok = document.execCommand('copy') } catch { ok = false }
  document.body.removeChild(ta)
  return ok
}
