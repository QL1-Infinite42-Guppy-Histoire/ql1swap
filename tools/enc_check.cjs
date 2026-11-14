const fs = require('fs'); const vm = require('vm');
const html = fs.readFileSync('index.html', 'utf8');
const logic = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('loadChain'));
const sb = { console, fetch, TextDecoder, setTimeout, clearTimeout };
sb.window = sb; vm.createContext(sb); vm.runInContext(logic, sb);
const { Interface } = require('/home/hatch/workspace/infinite-ql1-wallet/node_modules/ethers');
const R = sb.ROUTER, W = sb.WQOM, U = '0xc276b91c0e8d10260af7b67009d2683bb7776308', ME = '0x1111111111111111111111111111111111111111';
const path = [W.toLowerCase(), U]; const amt = 123456789n, min = 1000n, dl = 9999999999n;
const mine = {
  tokensForTokens: sb.SEL.swapTokensForTokens + sb.encUint(amt) + sb.encUint(min) + sb.encUint(160) + sb.encAddr(ME) + sb.encUint(dl) + sb.encUint(path.length) + path.map(sb.encAddr).join(''),
  ethForTokens: sb.SEL.swapETHForTokens + sb.encUint(min) + sb.encUint(128) + sb.encAddr(ME) + sb.encUint(dl) + sb.encUint(path.length) + path.map(sb.encAddr).join(''),
  tokensForETH: sb.SEL.swapTokensForETH + sb.encUint(amt) + sb.encUint(min) + sb.encUint(160) + sb.encAddr(ME) + sb.encUint(dl) + sb.encUint(path.length) + path.map(sb.encAddr).join(''),
  approve: sb.SEL.approve + sb.encAddr(R) + sb.encUint(amt),
  getAmountsOut: sb.SEL.getAmountsOut + sb.encUint(amt) + sb.encUint(64) + sb.encUint(path.length) + path.map(sb.encAddr).join(''),
  withdraw: sb.SEL.withdraw + sb.encUint(amt),
};
const iface = new Interface([
  'function swapExactTokensForTokens(uint256,uint256,address[],address,uint256)',
  'function swapExactETHForTokens(uint256,address[],address,uint256)',
  'function swapExactTokensForETH(uint256,uint256,address[],address,uint256)',
  'function approve(address,uint256)', 'function getAmountsOut(uint256,address[]) view returns (uint256[])',
  'function withdraw(uint256)', 'function deposit() payable',
]);
const ref = {
  tokensForTokens: iface.encodeFunctionData('swapExactTokensForTokens', [amt, min, path, ME, dl]),
  ethForTokens: iface.encodeFunctionData('swapExactETHForTokens', [min, path, ME, dl]),
  tokensForETH: iface.encodeFunctionData('swapExactTokensForETH', [amt, min, path, ME, dl]),
  approve: iface.encodeFunctionData('approve', [R, amt]),
  getAmountsOut: iface.encodeFunctionData('getAmountsOut', [amt, path]),
  withdraw: iface.encodeFunctionData('withdraw', [amt]),
};
let bad = 0;
for (const k of Object.keys(ref)) { const ok = mine[k].toLowerCase() === ref[k].toLowerCase(); if (!ok) bad++; console.log(ok ? 'ok  ' : 'FAIL', k); }
console.log('deposit selector:', sb.SEL.deposit, iface.encodeFunctionData('deposit', []));
process.exit(bad ? 1 : 0);
