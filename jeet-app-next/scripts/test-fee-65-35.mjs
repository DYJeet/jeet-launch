import test from 'node:test';
import assert from 'node:assert/strict';
import { feeAmounts, PLATFORM_BPS, CREATOR_BPS, PLATFORM_TREASURY } from '../src/lib/launch-fees.ts';
import { marketFeeOracle } from '../src/lib/launch-market.ts';
import { v5Fees } from '../src/lib/v5-pricing.ts';
test('approved treasury and rates remain pinned',()=>{
 assert.equal(PLATFORM_BPS,65);assert.equal(CREATOR_BPS,35);
 assert.equal(PLATFORM_TREASURY,'HVx69FZYW1bBkyK3RaVLNhhAPETZK9tA7E3CrHjrJ1wP');
});
test('one rounded total conserves every lamport across boundary and large amounts',()=>{
 for(const raw of [1n,2n,99n,100n,101n,399n,400n,9999n,10000n,10001n,10000000000000000n]){
  const total=(raw+99n)/100n;const p=(total*13n+19n)/20n;
  const legacy=feeAmounts(raw); assert.equal(legacy.fees,total);assert.equal(legacy.platform,p);assert.equal(legacy.creator,total-p);
  for(const fn of [marketFeeOracle,v5Fees]){const q=fn(raw,0n,0n);assert.equal(q.platform,p);assert.equal(q.creator,total-p);assert.equal(q.total,total);}
 }
});
test('mixed buys and sells share one deterministic lifetime carry',()=>{
 let p=0n,c=0n;
 for(let i=1n;i<=10000n;i++){
  const raw=(i*7919n)%1000003n+1n;const a=marketFeeOracle(raw,p,c),b=v5Fees(raw,p,c);
  assert.equal(a.platform,b.platform);assert.equal(a.creator,b.creator);
  assert.equal(a.platform+a.creator,(raw+99n)/100n);p+=a.platform;c+=a.creator;
  assert.equal(p,(13n*(p+c)+19n)/20n);assert.ok(20n*p-13n*(p+c)>=0n);assert.ok(20n*p-13n*(p+c)<20n);
 }
});
test('incompatible legacy carry fails closed instead of reallocating claims',()=>{
 for(const fn of [marketFeeOracle,v5Fees])assert.throws(()=>fn(10000n,75n,25n));
});
