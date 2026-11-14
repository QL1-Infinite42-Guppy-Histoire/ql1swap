# QL1Swap

A swap site for QL1, part of **Guppy's Guide**. Live since 2026-11-14.

- 🌐 Site: https://ql1-infinite42-guppy-histoire.github.io/ql1swap/
- 🧭 Dashboard: https://ql1-infinite42-guppy-histoire.github.io/guppys-guide-dashboard/

## What it does

- Connect MetaMask on QL1 (EVM chain ID 766) and swap tokens on **QomSwap**
  (router `0xc1f90231035A52091eBCb7dddaCa3051a5F44f30`, factory `0x475f361993D6FAcBF32fB82B66be0fB40f3d974C`).
- The token list is rebuilt on every load from the factory's pools: a token is listed when it has a
  live pool whose QOM side holds at least 10,000,000 QOM, or a qUSDT / qUSDC / qDAI pool
  (≥ 10 units of the stable). Tokens without a real pool are never listed — e.g. ZAP has no
  QomSwap pool on QL1 (0 pairs), so it does not appear.
- Quotes compare the direct pool and routes via WQOM / qUSDT / qUSDC / QSWAP / qCAW, all read
  live with the router's `getAmountsOut`; the best output wins. Prices come only from live pool
  reads — nothing is estimated or invented.
- Native QOM swaps route through WQOM inside the same transaction; QOM ⇄ WQOM is a wrap/unwrap.
- Approvals are exact-amount only. Slippage is adjustable (0.5 / 1 / 3% or custom).
- No external dependencies: the page is a single `index.html` with hand-rolled JSON-RPC/ABI code.

## Verification

- `tools/harness.cjs` — loads the page's own logic and checks it against the live chain
  (enumeration, listing rules, quotes cross-checked against ethers): 16/16 passed at launch.
- `tools/enc_check.cjs` — calldata encodings byte-compared against ethers for all swap entry points.
- The first real send from the site is the user's on-device end-to-end check.

Part of **Guppy's Guide** — Don't Panic, a hitchhiker's toolbox for 42 Chain & QL1. Developed by the community; not an official QL1 service.

MIT License
