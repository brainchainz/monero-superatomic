// Block explorer URL builders.
//
// Auto mode (no override set): derive the explorer host from however the user
// is reaching this dashboard right now. If they browsed here via umbrel.local,
// the explorer opens on umbrel.local; if via a Tailscale IP, it opens on that
// same IP. Same host, different port, so it works wherever the user is without
// any configuration:
//   Bitcoin  -> Umbrel mempool app, port 3006
//   Monero   -> MoneroSpace app, port 3008
// Both are mempool.space-style UIs, so /tx/<txid> resolves on each.
//
// Manual overrides (Config tab -> Explorers) replace the whole origin, for
// public explorers or Tor onion addresses where same-host-different-port
// does not apply.
const MEMPOOL_PORT = 3006
const MONEROSPACE_PORT = 3008

function autoBase(port) {
  return `${window.location.protocol}//${window.location.hostname}:${port}`
}

// These become href values, so refuse anything that is not http(s). The backend
// sanitizes too; this is the second lock on the same door, because a scheme
// like "javascript:" here would run in the dashboard's origin.
function safeBase(override, port) {
  return /^https?:\/\/[^\s]+$/i.test(String(override || '')) ? override : autoBase(port)
}

export function btcTxUrl(txid, settings) {
  return `${safeBase(settings?.btcExplorer, MEMPOOL_PORT)}/tx/${encodeURIComponent(txid)}`
}

export function xmrTxUrl(txid, settings) {
  return `${safeBase(settings?.xmrExplorer, MONEROSPACE_PORT)}/tx/${encodeURIComponent(txid)}`
}
