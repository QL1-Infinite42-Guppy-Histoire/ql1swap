// Probe 2: calibrate liquidity bars with real numbers.
// - WQOM-side reserve distribution across all WQOM pairs
// - ZAP (QL1) pairs, if any
// - Reserves of the major pairs
const { JsonRpcProvider, Contract, formatUnits } = require('/home/hatch/workspace/infinite-ql1-wallet/node_modules/ethers');
const RPC = 'https://evm-rpc-ql1.mschihuahua.org';
const FACTORY = '0x475f361993D6FAcBF32fB82B66be0fB40f3d974C';
const WQOM = '0xa26dfbf98dd1a32fae56a3d2b2d60a8a41b0bdf0';
const F_ABI = ['function allPairsLength() view returns (uint256)', 'function allPairs(uint256) view returns (address)', 'function getPair(address,address) view returns (address)'];
const P_ABI = ['function token0() view returns (address)', 'function token1() view returns (address)', 'function getReserves() view returns (uint112,uint112,uint32)'];
const lc = (a) => a.toLowerCase();
async function reserves(p, pair) {
  if (!pair || lc(pair) === '0x0000000000000000000000000000000000000000') return null;
  const c = new Contract(pair, P_ABI, p);
  const [t0, r] = await Promise.all([c.token0(), c.getReserves()]);
  return lc(t0) === lc(WQOM) ? { wqom: r[0], other: r[1] } : { wqom: r[1], other: r[0] };
}
async function main() {
  const p = new JsonRpcProvider(RPC, 766);
  const f = new Contract(FACTORY, F_ABI, p);
  const n = Number(await f.allPairsLength());
  const wqomReserves = [];
  let zapPairs = 0;
  const ZAP = '0x6041b64618434b9d0a9558b5975c5c1deb45cee6';
  for (let i = 0; i < n; i += 40) {
    const idx = Array.from({ length: Math.min(40, n - i) }, (_, k) => i + k);
    const addrs = await Promise.all(idx.map((j) => f.allPairs(j)));
    await Promise.all(addrs.map(async (pa) => {
      const c = new Contract(pa, P_ABI, p);
      try {
        const [t0, t1, r] = await Promise.all([c.token0(), c.token1(), c.getReserves()]);
        const a = lc(t0), b = lc(t1);
        if (a === ZAP || b === ZAP) { zapPairs++; console.log('ZAP pair', pa, 'reserves', r[0].toString(), r[1].toString(), 'other:', a === ZAP ? b : a); }
        if (a === WQOM || b === WQOM) {
          const w = a === WQOM ? r[0] : r[1];
          if (w > 0n && (a === WQOM ? r[1] : r[0]) > 0n) wqomReserves.push(Number(formatUnits(w, 18)));
        }
      } catch {}
    }));
  }
  wqomReserves.sort((x, y) => y - x);
  console.log('\nWQOM pairs with both sides > 0:', wqomReserves.length);
  console.log('WQOM-side reserve percentiles (in QOM):');
  [0, 4, 9, 24, 49, 99, 149, 199].forEach((i) => { if (wqomReserves[i] !== undefined) console.log(`  #${i + 1}: ${wqomReserves[i].toLocaleString('en-US', { maximumFractionDigits: 0 })}`); });
  console.log('count >= 1e6 QOM:', wqomReserves.filter((x) => x >= 1e6).length, '| >= 1e8:', wqomReserves.filter((x) => x >= 1e8).length, '| >= 1e9:', wqomReserves.filter((x) => x >= 1e9).length);
  console.log('ZAP pairs found:', zapPairs);
  const majors = {
    'WQOM/qUSDT': '0xc276b91c0e8d10260af7b67009d2683bb7776308',
    'WQOM/QSWAP': '0x4af41f453ead00d1cc6aa0b5b454bdeb102afc8d',
    'WQOM/qCAW': '0xd2140e16adf37194036865e90bbca1139b739d0d',
    'WQOM/O': '0x6c39b68a28ba90f4eb80032ec0eb32ad81cbbed4',
    'WQOM/qUSDC': '0xb0a125e9673dc8e12bbcd0769c1257cf4a836d54',
  };
  for (const [label, tok] of Object.entries(majors)) {
    const pair = await f.getPair(WQOM, tok);
    const r = await reserves(p, pair);
    console.log(label, pair, r ? `WQOM side: ${Number(formatUnits(r.wqom, 18)).toLocaleString('en-US', { maximumFractionDigits: 0 })} QOM` : 'NO PAIR');
  }
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
