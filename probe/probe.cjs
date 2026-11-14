// QL1Swap pre-build live probe: verify router/factory, enumerate all pairs,
// measure WQOM-denominated depth, test representative getAmountsOut quotes.
// Read-only. Run: node probe.cjs
const { JsonRpcProvider, Contract, formatUnits, parseUnits } = require('/home/hatch/workspace/infinite-ql1-wallet/node_modules/ethers');

const RPC = 'https://evm-rpc-ql1.mschihuahua.org';
const ROUTER = '0xc1f90231035A52091eBCb7dddaCa3051a5F44f30';
const FACTORY = '0x475f361993D6FAcBF32fB82B66be0fB40f3d974C';
const WQOM = '0xa26dfbf98dd1a32fae56a3d2b2d60a8a41b0bdf0';

const ROUTER_ABI = [
  'function factory() view returns (address)',
  'function WETH() view returns (address)',
  'function getAmountsOut(uint256,address[]) view returns (uint256[])',
];
const FACTORY_ABI = ['function allPairsLength() view returns (uint256)', 'function allPairs(uint256) view returns (address)'];
const PAIR_ABI = ['function token0() view returns (address)', 'function token1() view returns (address)', 'function getReserves() view returns (uint112,uint112,uint32)'];
const ERC20_ABI = ['function symbol() view returns (string)', 'function decimals() view returns (uint8)'];

const lc = (a) => a.toLowerCase();

async function main() {
  const p = new JsonRpcProvider(RPC, 766);
  const router = new Contract(ROUTER, ROUTER_ABI, p);
  const factory = new Contract(FACTORY, FACTORY_ABI, p);

  console.log('block', await p.getBlockNumber());
  console.log('gasPrice', (await p.getFeeData()).gasPrice?.toString());
  const fac = await router.factory();
  const weth = await router.WETH();
  console.log('router.factory()', fac, 'match:', lc(fac) === lc(FACTORY));
  console.log('router.WETH()   ', weth, 'is WQOM:', lc(weth) === lc(WQOM));

  const n = Number(await factory.allPairsLength());
  console.log('allPairsLength', n);

  // Enumerate pairs in parallel chunks
  const pairs = [];
  const chunk = 40;
  for (let i = 0; i < n; i += chunk) {
    const idx = Array.from({ length: Math.min(chunk, n - i) }, (_, k) => i + k);
    const addrs = await Promise.all(idx.map((j) => factory.allPairs(j)));
    const rows = await Promise.all(addrs.map(async (pa) => {
      const c = new Contract(pa, PAIR_ABI, p);
      try {
        const [t0, t1, r] = await Promise.all([c.token0(), c.token1(), c.getReserves()]);
        return { pair: lc(pa), t0: lc(t0), t1: lc(t1), r0: r[0], r1: r[1] };
      } catch (e) { return null; }
    }));
    pairs.push(...rows.filter(Boolean));
    process.stdout.write(`\renumerated ${pairs.length}/${n}`);
  }
  console.log('\npairs read:', pairs.length);
  const liquid = pairs.filter((x) => x.r0 > 0n && x.r1 > 0n);
  console.log('pairs with both reserves > 0:', liquid.length);

  // Token metadata for tokens in liquid pairs
  const tokens = new Set();
  liquid.forEach((x) => { tokens.add(x.t0); tokens.add(x.t1); });
  console.log('unique tokens in liquid pairs:', tokens.size);
  const meta = {};
  const tlist = [...tokens];
  for (let i = 0; i < tlist.length; i += chunk) {
    await Promise.all(tlist.slice(i, i + chunk).map(async (a) => {
      const c = new Contract(a, ERC20_ABI, p);
      let s = '?', d = 18;
      try { s = await c.symbol(); } catch { s = '(unreadable)'; }
      try { d = Number(await c.decimals()); } catch { d = 18; }
      meta[a] = { s, d };
    }));
  }

  // Spot value in WQOM via BFS over liquid pairs (reserve-ratio prices)
  const adj = new Map();
  const addEdge = (a, b, ra, rb) => {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a).push({ to: b, ra, rb });
  };
  liquid.forEach((x) => {
    const d0 = meta[x.t0].d, d1 = meta[x.t1].d;
    addEdge(x.t0, x.t1, Number(formatUnits(x.r0, d0)), Number(formatUnits(x.r1, d1)));
    addEdge(x.t1, x.t0, Number(formatUnits(x.r1, d1)), Number(formatUnits(x.r0, d0)));
  });
  // price in WQOM: BFS from WQOM preferring the deepest edge first (sort adjacency by reserve size desc)
  adj.forEach((es) => es.sort((a, b) => b.ra - a.ra));
  const price = { [WQOM]: 1 };
  const queue = [WQOM];
  while (queue.length) {
    const cur = queue.shift();
    for (const e of adj.get(cur) || []) {
      if (price[e.to] === undefined && e.ra > 0) {
        price[e.to] = price[cur] * (e.rb / e.ra);
        queue.push(e.to);
      }
    }
  }
  // Token depth = max over its pairs of min(side values in WQOM)
  const depth = {};
  liquid.forEach((x) => {
    const d0 = meta[x.t0].d, d1 = meta[x.t1].d;
    const v0 = price[x.t0] !== undefined ? Number(formatUnits(x.r0, d0)) * price[x.t0] : 0;
    const v1 = price[x.t1] !== undefined ? Number(formatUnits(x.r1, d1)) * price[x.t1] : 0;
    const pairMin = Math.min(v0, v1);
    depth[x.t0] = Math.max(depth[x.t0] || 0, pairMin);
    depth[x.t1] = Math.max(depth[x.t1] || 0, pairMin);
  });
  const rows = tlist
    .map((a) => ({ a, s: meta[a].s, d: meta[a].d, depth: depth[a] || 0, priced: price[a] !== undefined }))
    .sort((x, y) => y.depth - x.depth);
  console.log('\nTop tokens by best-pair depth (WQOM terms):');
  rows.slice(0, 40).forEach((r) => console.log(`  ${r.s.padEnd(16)} ${r.a} dec=${r.d} depth≈${r.depth.toFixed(1)} QOM priced=${r.priced}`));
  const over = (t) => rows.filter((r) => r.depth >= t).length;
  console.log('\ntokens with depth >= 100 QOM:', over(100), '| >= 1,000:', over(1000), '| >= 10,000:', over(10000), '| > 0:', over(0.000001));

  // Representative quotes
  const Q = async (label, amount, decIn, path) => {
    try {
      const out = await router.getAmountsOut(parseUnits(amount, decIn), path);
      console.log(`quote ${label}: in ${amount} -> out raw ${out[out.length - 1].toString()}`);
      return out;
    } catch (e) { console.log(`quote ${label}: FAILED ${e.message.slice(0, 100)}`); }
  };
  const QUSDT = '0xc276b91c0e8d10260af7b67009d2683bb7776308';
  const QCAW = '0xd2140e16adf37194036865e90bbca1139b739d0d';
  const O = '0x6c39b68a28ba90f4eb80032ec0eb32ad81cbbed4';
  const QSWAP = '0x4af41f453ead00d1cc6aa0b5b454bdeb102afc8d';
  await Q('10 QOM -> qUSDT (via WQOM)', '10', 18, [WQOM, QUSDT]);
  await Q('10 qUSDT -> QOM (via WQOM)', '10', 6, [QUSDT, WQOM]);
  await Q('1000 QSWAP -> WQOM', '1000', 18, [QSWAP, WQOM]);
  await Q('1000000 O -> WQOM', '1000000', 18, [O, WQOM]);
  await Q('100 QOM -> qCAW (WQOM direct?)', '100', 18, [WQOM, QCAW]);
  await Q('10 qUSDT -> qCAW via WQOM', '10', 6, [QUSDT, WQOM, QCAW]);
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
