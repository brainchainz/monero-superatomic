import React, { useEffect, useRef, useState } from 'react'

const CLEARNET_ADDR = '/ip4/0.0.0.0/tcp/9939'

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const pctFromFrac = v => +(((Number(v) || 0) * 100).toFixed(6))
const fracFromPct = v => +(((Number(v) || 0) / 100).toFixed(8))
// asb 5.x validates both fee multipliers at startup and refuses to boot on an
// out-of-range value, so clamp here instead of bricking the engine on Save.
const clampNum = (v, lo, hi, dflt) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt }
// btc_redeem_base_fee_multiplier is parsed as an exact decimal *string* in 5.x
// (TOML quoted) so the file never round-trips through a float — send it as one.
const decStr = (v, lo, hi, dflt) => clampNum(v, lo, hi, Number(dflt)).toFixed(2)

function ConfigEditor({ api, pending, onPendingConsumed, explorers, onExplorersSaved }) {
  const [cfg, setCfg] = useState(null)
  const [msg, setMsg] = useState('')
  const [btcExp, setBtcExp] = useState(explorers?.btcExplorer || '')
  const [xmrExp, setXmrExp] = useState(explorers?.xmrExplorer || '')
  const [expMsg, setExpMsg] = useState('')
  const [version, setVersion] = useState(null)

  useEffect(() => {
    api('/version').then(v => { if (v) setVersion(v) }).catch(() => {})
  }, [api])
  const loaded = useRef(false) // load once so a background refresh never wipes what you type

  async function saveExplorers() {
    setExpMsg('')
    try {
      const s = await api('/ui-settings', { method: 'POST', body: JSON.stringify({ btcExplorer: btcExp, xmrExplorer: xmrExp }) })
      if (s) { onExplorersSaved && onExplorersSaved(s); setExpMsg('Explorer settings saved.') }
    } catch (e) { setExpMsg('Error: ' + e.message) }
  }

  useEffect(() => {
    if (loaded.current) return
    loaded.current = true
    api('/config').then(d => {
      if (!d) return
      const c = d.config
      // Show spread and developer tip as whole-number percentages (2 not 0.02).
      c.maker.ask_spread = pctFromFrac(c.maker.ask_spread)
      // The maker binary floors the tip at 1% regardless of config, so display
      // at least 1 rather than showing a number the engine will not honor.
      c.maker.developer_tip = Math.max(1, pctFromFrac(c.maker.developer_tip))
      // asb 5.x removed maker.btc_redeem_fee_multiplier and added two fee
      // knobs in its place. Migrate any config written by an older build so a
      // Save here produces a file the 5.x binary actually accepts.
      if ('btc_redeem_fee_multiplier' in c.maker) delete c.maker.btc_redeem_fee_multiplier
      if (c.maker.btc_swap_fee_rate_multiplier === undefined) c.maker.btc_swap_fee_rate_multiplier = 1.0
      if (c.maker.btc_redeem_base_fee_multiplier === undefined) c.maker.btc_redeem_base_fee_multiplier = '2.50'
      setCfg(c)
    })
  }, [api])

  // Merge values handed over from the Planner once the config has loaded. These
  // stay unsaved so the user reviews them before hitting Save and Restart.
  useEffect(() => {
    if (!cfg || !pending) return
    setCfg(c => ({ ...c, maker: { ...c.maker, ask_spread: pending.ask_spread, max_buy_btc: pending.max_buy_btc } }))
    setMsg('Applied suggested settings from the Planner. Review the values, then click Save and Restart.')
    onPendingConsumed && onPendingConsumed()
  }, [cfg, pending])

  async function save() {
    setMsg('Saving...')
    try {
      const out = JSON.parse(JSON.stringify(cfg))
      // Convert percentages back to fractions and coerce numeric fields so the
      // ASB's typed config parser accepts them.
      out.maker.ask_spread = fracFromPct(out.maker.ask_spread)
      // Clamp to the binary's 1% floor so the saved file matches reality.
      out.maker.developer_tip = fracFromPct(Math.max(1, Number(out.maker.developer_tip) || 0))
      out.maker.min_buy_btc = num(out.maker.min_buy_btc)
      out.maker.max_buy_btc = num(out.maker.max_buy_btc)
      out.maker.btc_swap_fee_rate_multiplier = clampNum(out.maker.btc_swap_fee_rate_multiplier, 1, 3, 1)
      out.maker.btc_redeem_base_fee_multiplier = decStr(out.maker.btc_redeem_base_fee_multiplier, 2, 4, '2.50')
      out.maker.refund_policy.anti_spam_deposit_ratio = num(out.maker.refund_policy.anti_spam_deposit_ratio)
      out.bitcoin.target_block = parseInt(out.bitcoin.target_block, 10) || 1
      out.tor.hidden_service_num_intro_points = parseInt(out.tor.hidden_service_num_intro_points, 10) || 5
      if (!out.maker.external_bitcoin_redeem_address) delete out.maker.external_bitcoin_redeem_address
      await api('/config', { method: 'POST', body: JSON.stringify({ config: out }) })
      // The config file alone does nothing until the ASB reloads it.
      setMsg('Saved. Restarting the ASB to apply...')
      await api('/restart', { method: 'POST' })
      setMsg('Saved and applied. The ASB is restarting; quotes resume after the wallet re-syncs (about a minute).')
    } catch (e) { setMsg('Error: ' + e.message) }
  }

  function set(path, value) {
    const next = { ...cfg }
    let cur = next
    const parts = path.split('.')
    for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]] = { ...cur[parts[i]] }
    cur[parts[parts.length - 1]] = value
    setCfg(next)
  }

  if (!cfg) return <div className="card">Loading config...</div>

  const clearnetOn = (cfg.network.listen || []).length > 0

  return (
    <div className="card">
      <div className="card-title flex-between">
        <span>ASB Configuration</span>
        <button onClick={save}>Save and Restart</button>
      </div>
      {msg && <div className="banner">{msg}</div>}

      <section>
        <h3>Liquidity</h3>
        <label>Min BTC per swap</label>
        <input value={cfg.maker.min_buy_btc} onChange={e => set('maker.min_buy_btc', e.target.value)} />
        <label>Max BTC per swap</label>
        <input value={cfg.maker.max_buy_btc} onChange={e => set('maker.max_buy_btc', e.target.value)} />
        <label>Ask spread (%)</label>
        <input value={cfg.maker.ask_spread} onChange={e => set('maker.ask_spread', e.target.value)} />
        <label>Anti-spam deposit ratio</label>
        <input value={cfg.maker.refund_policy.anti_spam_deposit_ratio} onChange={e => set('maker.refund_policy.anti_spam_deposit_ratio', e.target.value)} />
        <label>External BTC redeem address</label>
        <input value={cfg.maker.external_bitcoin_redeem_address || ''} onChange={e => set('maker.external_bitcoin_redeem_address', e.target.value)} placeholder="Leave empty to use internal wallet" />
        <label>BTC fee-rate multiplier (1.0–3.0)</label>
        <input value={cfg.maker.btc_swap_fee_rate_multiplier} onChange={e => set('maker.btc_swap_fee_rate_multiplier', e.target.value)} />
        <label>BTC redeem base fee multiplier (2.00–4.00)</label>
        <input value={cfg.maker.btc_redeem_base_fee_multiplier} onChange={e => set('maker.btc_redeem_base_fee_multiplier', e.target.value)} />
        <label>Developer tip (%)</label>
        <input value={cfg.maker.developer_tip} onChange={e => set('maker.developer_tip', e.target.value)} />
        <p className="muted" style={{ marginTop: '-6px' }}>
          Minimum 1%. You can set it higher to support development further.
        </p>
      </section>

      <section>
        <h3>Network</h3>
        <label className="check-row">
          <input type="checkbox" checked={clearnetOn} onChange={e => set('network.listen', e.target.checked ? [CLEARNET_ADDR] : [])} />
          <span>Expose a clearnet listener (port 9939). Off by default. Leaving it off keeps your node reachable only over Tor and does not reveal your IP.</span>
        </label>
        <label>Rendezvous points</label>
        <textarea rows={4} value={(cfg.network.rendezvous_point || []).join('\n')} onChange={e => set('network.rendezvous_point', e.target.value.split('\n').map(s => s.trim()).filter(Boolean))} />
      </section>

      <section>
        <h3>Tor</h3>
        <label className="check-row">
          <input type="checkbox" checked={!!cfg.tor.register_hidden_service} onChange={e => set('tor.register_hidden_service', e.target.checked)} />
          <span>Publish a Tor hidden service (recommended). Lets swap counterparties reach you over Tor.</span>
        </label>
        <label>Intro points</label>
        <input value={cfg.tor.hidden_service_num_intro_points} onChange={e => set('tor.hidden_service_num_intro_points', parseInt(e.target.value) || 5)} />
      </section>

      <section>
        <h3>Bitcoin</h3>
        <label>Electrum RPC URLs</label>
        <textarea rows={3} value={(cfg.bitcoin.electrum_rpc_urls || []).join('\n')} onChange={e => set('bitcoin.electrum_rpc_urls', e.target.value.split('\n').map(s => s.trim()).filter(Boolean))} />
        <label>Target block</label>
        <input value={cfg.bitcoin.target_block} onChange={e => set('bitcoin.target_block', e.target.value)} />
      </section>

      <section>
        <h3>Swap Engine</h3>
        <p className="muted">
          The Automated Swap Backend built into this app, reported by the running binary itself.
        </p>
        <div className="label">ASB version</div>
        <div className="value">{version ? version.asb : 'Reading...'}</div>
      </section>

      <section>
        <h3>Block Explorers</h3>
        <p className="muted">
          Where the &#8599; buttons next to transaction ids open. Leave empty for automatic mode:
          the explorer opens on the same host you are using for this dashboard right now, with the
          Umbrel mempool app on port 3006 for Bitcoin and MoneroSpace on port 3008 for Monero, so
          it works over LAN and Tailscale without setup. Set a URL to override (for example
          https://mempool.space, or an onion address when browsing over Tor). Note that a public
          explorer learns which transactions you look up; your self-hosted apps do not.
        </p>
        <label>Bitcoin explorer URL (empty = this host, port 3006)</label>
        <input value={btcExp} onChange={e => setBtcExp(e.target.value)} placeholder="https://mempool.space" />
        <label>Monero explorer URL (empty = this host, port 3008)</label>
        <input value={xmrExp} onChange={e => setXmrExp(e.target.value)} placeholder="http://umbrel.local:3008" />
        {expMsg && <div className={expMsg.startsWith('Error') ? 'error' : 'banner'}>{expMsg}</div>}
        <div className="button-row">
          <button type="button" onClick={saveExplorers}>Save explorers</button>
        </div>
        <p className="muted">Saved separately; does not restart the ASB.</p>
      </section>

      <button onClick={save}>Save and Restart</button>
      {msg && <div className="banner">{msg}</div>}
    </div>
  )
}

export default ConfigEditor
