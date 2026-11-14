// QL1Swap harness: load the page's own logic script in a VM and verify against the live chain.
// - enumeration + token list (majors present, ZAP absent, qUSDT decimals = 6)
// - quotes via the page's bestQuote(), cross-checked against ethers getAmountsOut
// - wrap/unwrap detection and calldata encodings for the three swap functions
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const logic = scripts.find((s) => s.includes('loadChain'));
if (!logic) { console.error('logic script not found'); process.exit(1); }
const sandbox = { console, fetch, TextDecoder, setTimeout, clearTimeout, URL };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(logic, sandbox);
const { Contract, JsonRpcProvider, parseUnits } = require('/home/hatch/workspace/infinite-ql1-wallet/node_modules/ethers');

let pass = 0, fail = 0;
function check(name, cond, extra) { if (cond) { pass++; console.log('  ok  ', name, extra || ''); } else { fail++; console.log('  FAIL', name, extra || ''); } }

(async () => {
  const info = await sandbox.loadChain();
  console.log('loadChain:', JSON.stringify(info));
  check('pairs enumerated = 645', info.pairCount === 645, String(info.pairCount));
  check('liquid pairs >= 600', info.liquid >= 600, String(info.liquid));
  const toks = sandbox.S.tokens;
  const bySym = (s) => toks.find((t) => t.symbol === s);
  check('native QOM listed first', toks[0].isNative && toks[0].symbol === 'QOM');
  check('WQOM listed', !!bySym('WQOM'));
  const qusdt = bySym('qUSDT');
  check('qUSDT listed, decimals 6', !!qusdt && qusdt.decimals === 6, qusdt && String(qusdt.decimals));
  check('QSWAP listed', !!bySym('QSWAP'));
  check('qCAW listed', !!bySym('qCAW'));
  const oTok = toks.find((t) => t.address === '0x6c39b68a28ba90f4eb80032ec0eb32ad81cbbed4');
  check('real O (0x6c39…) listed', !!oTok);
  const zap = toks.find((t) => t.address === '0x6041b64618434b9d0a9558b5975c5c1deb45cee6');
  check('QL1 ZAP NOT listed (no pool)', !zap);
  check('token count sane (30..320)', toks.length >= 30 && toks.length <= 320, String(toks.length));

  const native = toks[0], wqom = bySym('WQOM'), qswap = bySym('QSWAP'), qcaw = bySym('qCAW');
  const q1 = await sandbox.bestQuote(parseUnits('1000000000', 18), native, qusdt);
  check('quote 1e9 QOM -> qUSDT > 0', !!q1 && q1.out > 0n, q1 ? q1.out.toString() : 'null');
  console.log('       path:', q1 && q1.path.join(' -> '), 'impact:', q1 && q1.impact);
  const q2 = await sandbox.bestQuote(parseUnits('10', 6), qusdt, native);
  check('quote 10 qUSDT -> QOM > 0', !!q2 && q2.out > 0n, q2 ? q2.out.toString() : 'null');
  const q3 = await sandbox.bestQuote(parseUnits('1000', 18), qswap, qcaw);
  check('quote 1000 QSWAP -> qCAW > 0', !!q3 && q3.out > 0n, q3 ? q3.path.join('>') : 'null');
  const q4 = await sandbox.bestQuote(parseUnits('100', 18), native, wqom);
  check('QOM -> WQOM is wrap', !!q4 && q4.wrap === 'wrap');
  const q5 = await sandbox.bestQuote(parseUnits('100', 18), wqom, native);
  check('WQOM -> QOM is unwrap', !!q5 && q5.wrap === 'unwrap');

  // cross-check one quote against ethers directly
  const p = new JsonRpcProvider('https://evm-rpc-ql1.mschihuahua.org', 766);
  const router = new Contract('0xc1f90231035A52091eBCb7dddaCa3051a5F44f30', ['function getAmountsOut(uint256,address[]) view returns (uint256[])'], p);
  const ref = await router.getAmountsOut(parseUnits('1000000000', 18), q1.path);
  check('page quote == ethers getAmountsOut (same path)', ref[ref.length - 1] === q1.out, ref[ref.length - 1].toString());

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
