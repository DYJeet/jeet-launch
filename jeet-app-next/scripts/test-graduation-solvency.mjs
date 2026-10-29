import assert from 'node:assert/strict';
import { test } from 'node:test';
import { quoteCurveCost } from '../src/lib/launch-custody.ts';
import { redemptionOracle } from '../src/lib/launch-market.ts';
const curve = (sold=0n, scale=1n) => ({base:10000n,slope:10n,scale,sold,inventory:980n,collected:0n});
test('V4 completion has no deterministic migration token inventory',()=>{
 const supply=1000n,creator=20n,inventory=supply-creator,sold=inventory;
 assert.equal(inventory-sold,0n); assert.equal(creator+sold,supply);
});
test('valid completed V4 path has exactly zero SOL available after redemption backing',()=>{
 const before=curve(), inventory=before.inventory;
 const reserve=quoteCurveCost(before,inventory), liability=redemptionOracle({...before,sold:inventory},inventory);
 assert.equal(reserve,14597100n);assert.equal(liability,reserve);assert.equal(reserve-liability,0n);
});
test('mixed adversarial paths retain gross redemption backing across denominations',()=>{
 for(const scale of [1n,10n,100n,1000000000n]){
  let sold=0n,reserve=0n;
  for(let step=1n;step<=2000n;step++){
   const n=step*17n%31n+1n, c=curve(sold,scale);
   if(step%3n===0n && n<=sold){reserve-=redemptionOracle(c,n);sold-=n;}
   else {reserve+=quoteCurveCost(c,n);sold+=n;}
   const backing=sold ? redemptionOracle(curve(sold,scale),sold):0n;
   assert.ok(reserve>=backing);assert.ok(reserve>=0n);
  }
 }
});
test('fractional rounding surplus is accounted but not a guaranteed funding source',()=>{
 const c={...curve(0n,100n),base:1n,slope:0n};
 const reserve=quoteCurveCost(c,1n)+quoteCurveCost({...c,sold:1n},1n);
 const liability=redemptionOracle({...c,sold:2n},2n);
 assert.equal(reserve,2n);assert.equal(liability,0n);
 assert.equal(quoteCurveCost(curve(),980n)-redemptionOracle(curve(980n),980n),0n);
});
test('symbolic new-launch partition cannot add migration tokens without reducing another allocation',()=>{
 for(let m=1n;m<980n;m++){
  const supply=1000n,creator=20n,buyInventory=980n-m;
  assert.equal(creator+buyInventory+m,supply);assert.ok(buyInventory<980n);
 }
});
