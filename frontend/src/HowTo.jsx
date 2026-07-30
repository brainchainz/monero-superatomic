import React from 'react'

function HowTo() {
  return (
    <>
      <div className="card">
        <div className="card-title">How Monero SuperAtomic works</div>
        <p className="muted">
          This node is an Automated Swap Backend (ASB). It holds Monero, advertises a price to the
          swap network, and trades your XMR for BTC through trustless atomic swaps. You set the
          terms; the node does the rest and keeps your BTC. Follow these steps in order the first
          time you set it up.
        </p>
      </div>

      <div className="card">
        <div className="card-title">1. Back up before you fund</div>
        <p className="warning">Do this first. If you fund before you back up and something goes wrong, the funds can be unrecoverable.</p>
        <p className="muted">
          Open the <b>Backup</b> tab, set a dashboard password if you have not, then download the
          <b> full backup</b>. Encrypt it with a strong passphrase you store separately. This single
          archive contains everything: the Monero wallet, the Bitcoin wallet, the swap database
          (needed to recover a swap that stalls mid-flight), and the Tor key. Keep a copy offline.
        </p>
      </div>

      <div className="card">
        <div className="card-title">2. Verify you can restore</div>
        <p className="muted">
          A backup you have never tested is not a backup. From the Backup tab, reveal the
          <b> Monero seed</b> plus its <b>restore height</b> and confirm it opens your wallet in
          <b> Feather</b> (or the Monero CLI). Reveal the <b>Bitcoin descriptor</b> and confirm it
          imports into <b>Sparrow</b>. Protect any wallet you create there with a strong password.
          Once you have seen both restore cleanly, you know your recovery kit works.
        </p>
      </div>

      <div className="card">
        <div className="card-title">3. Fund the Monero wallet</div>
        <p className="muted">
          Open the <b>Funding</b> tab and send XMR to the node's Monero address. Your Monero and
          Bitcoin keys are independent, so funding XMR does not touch your BTC. Send enough to make
          real offers: below roughly <b>0.2 XMR</b> your balance sits under the minimum swap size and
          the node advertises a zero maximum, so no one can trade with it yet. Wait for the balance
          to confirm and unlock before expecting swaps.
        </p>
      </div>

      <div className="card">
        <div className="card-title">4. Set your terms</div>
        <p className="muted">
          In the <b>Config</b> tab, set your <b>spread</b> (your markup over market, as a whole
          percent) and your <b>min</b> and <b>max</b> swap sizes. Use the <b>Planner</b> tab to see
          how much BTC a given spread earns against your current XMR balance before you commit.
          Leave <b>Clearnet off</b> unless you have a reason to expose your IP; Tor-only keeps the
          node private. Set an external BTC redeem address here if you want swaps to pay out to cold
          storage instead of the internal wallet. A 1% developer tip on each completed swap supports
          ongoing work.
        </p>
      </div>

      <div className="card">
        <div className="card-title">What to expect</div>
        <p className="muted">
          Your maker registers with several rendezvous points, over Tor and clearnet, which is how
          takers discover you. A running, funded maker shows up in eigenwallet's maker list. Takers
          connect to you on demand to pull a quote or start a swap, so it is normal for your maker to
          read as connected only some of the time rather than constantly; what matters is that you
          are reachable when someone wants to trade. Swaps arrive when a taker accepts your price;
          each one appears on the <b>Overview</b> and advances through its phases automatically. Keep
          the node online so takers can reach you and so a swap in progress can finish (the swap
          database in your backup is the safety net if one is ever interrupted).
        </p>
      </div>

      <div className="card">
        <div className="card-title">Sharing screenshots</div>
        <p className="muted">
          Click <b>Hide</b> in the top bar before you screenshot, screen share, or record. It
          replaces everything identifying with dots until you click <b>Show</b> again: addresses,
          peer id, onion address, transaction ids, seeds, balances, prices, and swap amounts. Copy
          buttons still copy the real value while hidden, so you can paste an address without
          putting it on screen. One thing it cannot cover: opening a transaction in a block explorer
          shows that id in the explorer page's address bar.
        </p>
      </div>

      <div className="card">
        <div className="card-title">Safety</div>
        <p className="muted">
          Never share your seed, descriptor, or backup file; anything that can restore this node can
          move all of its funds. Refresh your backup after changing the dashboard password or any
          time the swap database changes. Treat the dashboard password as protecting live funds and
          use a strong, unique one.
        </p>
        <p className="fine-print">
          Disclaimer: Monero SuperAtomic is an independent packaging of the open source Eigen ASB
          with a management dashboard. We are not the developers of the underlying swap protocol
          and do not operate, custody, or control your funds. Atomic swaps, like all cryptocurrency
          transactions, carry inherent risk. This software is provided as is, without warranty of
          any kind. To the maximum extent permitted by law, the packagers accept no liability for
          lost funds or other damages arising from defects in this wrapper or in the underlying
          protocol, network conditions, misconfiguration, failed or interrupted swaps, or user
          error. You are solely responsible for your configuration, your backups, and the funds you
          place on this node. Nothing in this application is financial advice.
        </p>
      </div>
    </>
  )
}

export default HowTo
