# State Machines: Audit and Unified Status Plan

**SuperAtomic tracks a lot of state. Almost none of it is modeled.** This document
inventories every implicit state machine in the app (dashboard, scripts, packaging)
and the swap core it embeds, and specifies one additive plan — the **status fabric** —
that makes all of them explicit, machine-readable, and safe to depend on, without
breaking a single existing interface.

Audience: operators, contributors, agents (Hermes-class automation, monitoring, CI).
Status: living document. Phase checkboxes live at the bottom.

---

## 1. Why this exists (two real incidents)

- **"Tor onion: Starting" for hours.** The arti onion service was stuck in a
  bootstrapping loop. Every layer carried *some* state (arti internals, asb boot
  sequence, a backend bool, a UI string), none of it modeled — so the page could only
  render the word "Starting", and the diagnosis was raw-log archaeology.
- **Store served a stale version.** "Is the new build applied?" took a cross-repo hunt
  through tags, digests, and update logs. Nothing exposed *update state* as data.

Both are the same bug pattern: **state exists but is implicit** — flags, marker files,
`Option`s, stringly fields, log lines. Outputs:

- **UX**: statuses with no reason, no ETA, no advice; silent stalls; "Starting" means
  eight different things.
- **DX**: state logic smeared across `server.js` booleans, bash `if [ ! -f … ]`, and
  Rust `format!("{:?}")`; nothing to unit-test; debugging = grepping.
- **AX**: every agent re-derives state from scratch by parsing logs; every new
  consumer re-implements every mapping.

## 2. What already exists (build on, never break)

- The swap engine's own state machine: persisted swap states (swap-db) and the
  `swap-machine` crate's typed `AliceState` / `BobState` (5.x) — the **reference
  implementation** of the pattern. Expose it; don't touch it.
- `EventLoopRequest`: typed request enum between RPC server and asb event loop.
- `swap/src/asb/recovery/`: six recovery workflows (cancel, redeem, refund, punish,
  grant_mercy, safely_abort).
- Process supervision (supervisord) and the host-side onion watchdog — the watchdog is
  already a primitive explicit machine (strikes → cooldown → restart, with a log).

## 3. The decision: one fabric — "models, not markers"

1. **Every wait, flag, or marker that gates behavior becomes a named state machine**:
   explicit state enum, single owner, crash-safe snapshot, and a timeout on *every*
   waiting state (nothing waits forever silently).
2. **One surface**: `GET /api/status` — one schema-versioned JSON document listing
   every machine as `{id, state, since, reason?, advice?, seq}`. Dashboard, watchdog,
   and agents all read the same document.
3. **One transition stream**: `transitions.jsonl` — one structured line per change
   (`{ts, machine, from, to, cause}`). Raw debug logs stay for detail; the stream is
   the story.
4. **Stable IDs**: machine ids and state names are API. Append-only; renames bump the
   schema version.
5. **Failure isolation**: one adapter per machine. A broken adapter yields
   `state: unknown, reason` — never a 500, never a silent lie.
6. **Back-compat**: all v1 endpoints stay frozen; UI migrates behind a flag; a
   `STATUS_FABRIC=off` kill switch restores today's behavior exactly.

## 4. Inventory: the implicit machines (found audit, 2026-11)

Phase = target wave (P1 wrapper-only, additive; P2 core asb; P3 flows; P4 polish).

| # | Machine | Where it lives today | Today's form | Worst failure it causes | Phase |
|---|---|---|---|---|---|
| 1 | Container boot sequence | `scripts/entrypoint.sh`, `supervisord.conf` | supervisor priorities, no phases | silent half-boot; "Starting" soup | P1 |
| 2 | ASB readiness | `backend/server.js` (`asbReady` bool, `asbRpc().catch(()=>null)`) | boolean + swallowed errors | bool can't say *why*; unknown ≠ down | P1 |
| 3 | Onion service | asb `onion_service_status` → `state: String`, `reachable`, `problem` | stringly `format!("{:?}")` | "Starting" with no cause/advice; watchdog had to hard-code strings | P1 |
| 4 | rpc-auth / install markers | `exports.sh` (`if [ ! -f … ]` chains) | marker files | partial installs; reinstall weirdness | P1 |
| 5 | Install/update script | `exports.sh`, store manifests | imperative bash steps | no "where am I" for install or update | P1 |
| 6 | Update / asset-heal | `nginx.conf` cache-healing, digest-pinned images, store tags | comments + folklore | "did the update apply?" hunts | P1 |
| 7 | Restore job | `backend/server.js` (stop→validate→extract→start) | fire-and-forget + text | can't tell phase; failure = ambiguous state | P1 |
| 8 | Backup job | `backend/server.js` (tar of candidate paths) | one-shot | silent partial backups | P1 |
| 9 | Setup/onboarding | `passwordSet()` marker, `/api/auth/*`, `Setup.jsx` wizard | markers + route guards | wizard steps unassertable; re-entry messy | P1 |
| 10 | Watchdog / self-heal | `tools/umbrel-watchdog/*` (strikes, cooldown, grace, log) | marker files + shell | works, but invisible to status API | P1 |
| 11 | Tor bootstrap | arti (frac/progress at startup) | startup wait | invisible at platform level | P2 |
| 12 | Peer connectivity | `active_connections` count; dial priorities, redial backoff (swap-p2p) | numbers + intervals | "0 connections" ≠ "unreachable" | P2 |
| 13 | Rendezvous registration | `registration_status` per node (backoff per rendezvous point) | status value + retries | registration flaps invisible | P2 |
| 14 | Transport reachability | `is_fully_reachable()` gates (wormhole spawn etc.) | derived ad-hoc at call sites | gates flip silently; no single truth | P2 |
| 15 | Wormhole services | `wormhole_services` → `state: Option<String>` | stringly `{:?}` + `problem` | same as onion: unreadable, unassertable | P2 |
| 16 | Swap lifecycle | swap-db + `swap-machine` (AliceState/BobState) | **explicit — reference** | expose only; never rebuild | P2 |
| 17 | Per-swap flags | `burn_on_refund`, `withhold_deposit` | booleans | attributes of #16; derive | P2 |
| 18 | Monero wallet sync/rescan | wallet refresh, restore-height rescan | progress in logs | funding page can't say "syncing x%" | P2 |
| 19 | monero-rpc-pool health | connection pool, backoff | implicit | pool thrash invisible | P2 |
| 20 | electrum-pool health | connection/sync/retry (target_block) | implicit | BTC side blindsides | P2 |
| 21 | Quote lifecycle | current quote, inflight dedupe (`ensure_quote_computation_is_inflight`) | flags | quote stale ≠ unavailable | P3 |
| 22 | Recovery workflows | `asb/recovery/*` (6 workflows) | modules w/ implicit phases | mid-recovery state opaque | P3 |
| 23 | Withdraw broadcast | `withdraw_btc/xmr`, `withdrawals.json` pending list | implicit pending → txid | "where is my withdrawal" | P3 |
| 24 | Seed reveal/replace | `seed.pem`, `/api/seeds/:type` | file marker + flow | reveal flow unassertable | P3 |
| 25 | Config editor | `/api/config` + restart-required semantics | "restart needed" folklore | config drift; surprise restarts | P3 |
| 26 | DB migrations | swap-db (sqlx) | version markers | migration failure = opaque boot | P2 |
| 27 | Activity/txid stitching | `/api/activity` derived from RPCs | assembly logic | missing rows look like missing funds | P3 |
| 28 | UI settings / privacy toggle | `ui-settings.json` | json file | minor | P4 |
| 29 | Log janitor | `scripts/log-janitor.sh` | rotation | minor | P4 |

## 5. Target architecture (all additive)

**Registry (wrapper, Node):** `backend/state/` — one small module per machine with
`{id, snapshot(), subscribe()}` and adapters (asb RPC, supervisor, files, systemd).
One aggregator serves:

```http
GET /api/status          →  200
{
  "schema": 2, "ts": "…", "overall": "starting|operational|degraded|down",
  "machines": [
    {"id": "onion.service", "state": "recovering", "since": "…", "seq": 412,
     "reason": "intro points 2/3, circuit builds timing out",
     "advice": "auto-heal armed; check back in 5 min"},
    {"id": "boot.phase", "state": "awaiting_tor", "since": "…", "seq": 7, …}
  ]
}
```

**Transition stream:** `/data/logs/transitions.jsonl`, capped + rotated:

```json
{"ts":"…","machine":"onion.service","from":"bootstrapping","to":"running","cause":"intro points established"}
```

**UI binding:** one shared map `state → {label, severity, advice}` consumed by the
Connectivity page, dashboard banner, and the agent runbook. A naked "Starting" can no
longer exist: every state ships a reason and next step.

**Agent runbook (AX):** canonical operations become three commands: read `/api/status`;
tail `transitions.jsonl`; act on `advice`. No log mining.

## 6. Phased plan (no breakage, each phase shippable)

- **P1 — wrapper fabric (no Rust build):** registry + `/api/status` + transitions
  stream + machines #1-10. UI switches Connectivity/banner behind flag, shadow-reads
  first. *Acceptance:* kill -9 during restore → status shows exact phase and resumes;
  boot stall → page shows phase + reason + armed heal; watchdog visible as machine.
- **P2 — core asb (additive RPC):** typed wire states for #3, #11-15 (replace
  `String`/`{:?}` with stable enums + `since` + advice; keep old fields), wallet/pool
  health machines #18-20, migrations #26; aggregate `status` RPC. *Acceptance:* one RPC
  call describes the asb; an onion flap is readable end-to-end in the transition log.
- **P3 — flows:** #21-25, #27 (quote, recovery phases, withdrawals, seeds, config).
- **P4 — suite:** same registry shape across Space / Superbrain / SuperPay /
  Superstress; box-level status over the tailnet; fleet runbook.

Guardrails in every phase: v1 endpoints frozen; kill switch; adapter isolation; capped
logs; tests assert "no occupied waiting state exceeds its timeout without a
transition"; grep-checklist (`bool`, `[ ! -f ]`, `.catch(() => null)`, `{:?}` statuses)
run to catch stragglers.

## 7. Rules for contributors

- New state → new machine, not a new boolean or marker. Booleans derive from machines.
- Don't swallow status errors into `null` — unknown is a state, with a reason.
- The swap core is the reference; wrap and expose it.
- Machine IDs are API: append-only.

## 8. Phase checkboxes

- [ ] P1 wrapper fabric
- [ ] P2 core asb typed status
- [ ] P3 flows
- [ ] P4 suite-wide
