// Non-activating economic reference model. Not an on-chain instruction or AMM mock.
import assert from 'node:assert/strict';
import { test } from 'node:test';
const U64=(1n<<64n)-1n;
const checked=n=>{if(n<0n||n>U64)throw Error('u64');return n;};
function plan(s,q=1n,bps=100n,target=50000000000n){
 checked(s);checked(q);checked(target);
 if(s===0n||q<1n||q>1000000000n||!/^10*$/.test(q.toString())||s%q||bps<0n||bps>500n||target===0n)throw Error('configuration');
 const w=s/q,a=w*bps/10000n,net=w-a;
 if(net<2n||net%2n)throw Error('partition parity');
 const b=net/2n,p=(target+b-1n)/b;
 return {s,q,a:a*q,b:b*q,m:b*q,p,x:checked(p*b)};
}
function model(c){let s=0n,r=0n,p=0n,k=0n,buy=0n,sell=0n,withdrawn=0n,migrated=false;
 const snapshot=()=>({s,r,p,k,buy,sell,withdrawn,migrated,m:c.m});
 function trade(n,side=false,externalSuccess=true){
  const before=snapshot();
  try{
   if(migrated||n<=0n||n%c.q)throw Error('closed/lot');
   if(side?n>s:n>c.b-s)throw Error('inventory');
   const raw=checked(c.p*(n/c.q)),f=(raw+99n)/100n,total=checked(p+k+f),np=(3n*total+3n)/4n,nk=total-np;
   if(side&&raw<=f)throw Error('dust');
   const terminal=!side&&s+n===c.b;
   if(terminal&&!externalSuccess)throw Error('AMM/LP failure');
   if(side){r-=raw;s-=n;sell+=raw-f;}else{r=checked(r+raw);s+=n;buy+=raw+f;}
   p=np;k=nk;
   if(terminal){assert.equal(r,c.x);r=0n;migrated=true;}
   invariant();return raw;
  }catch(e){assert.deepEqual(snapshot(),before);throw e;}
 }
 function invariant(){assert.equal(c.a+(c.b-s)+s+c.m,c.s);assert.equal(buy,sell+r+(migrated?c.x:0n)+p+k);if(!migrated)assert.equal(r,c.p*(s/c.q));assert.equal(p,(3n*(p+k)+3n)/4n);}
 return {trade,snapshot,invariant,claim:()=>{const available=p+k-withdrawn;if(available===0n)throw Error("duplicate claim");withdrawn+=available;invariant();return available;}};
}
test('representative partitions, price and guaranteed completion reserve',()=>{
 for(const [whole,q] of [[1000n,1n],[1000000n,1000n],[1000000000n,1000000000n]]){
  const c=plan(whole*q,q);assert.equal(c.a+c.b+c.m,c.s);assert.equal(c.b,c.m);assert.ok(c.x>=50000000000n);assert.ok(c.x-50000000000n<c.b/q);assert.equal(c.x*c.q,c.p*c.m);
 }
 const c=plan(1000000000000000000n,1000000000n);assert.equal(c.a,10000000000000000n);assert.equal(c.b,495000000000000000n);assert.equal(c.p,102n);assert.equal(c.x,50490000000n);
});
test('zero, minimum, parity, creator bounds and maximum u64 supply',()=>{
 for(const args of [[0n],[1n],[3n,1n,0n],[100n,1n,501n],[100n,1n,-1n],[U64+1n],[100n,0n],[101n,10n]])assert.throws(()=>plan(...args));
 assert.equal(plan(2n,1n,0n).b,1n);assert.equal(plan(U64-1n,1n,0n).s,U64-1n);
 assert.equal(plan(1000n,1n,500n).a,50n);assert.equal(plan(1000n,1n,0n).a,0n);
});
test('partial/full redemptions maintain exact reserve and separate fees across multiwallet orderings',()=>{
 const c=plan(1000000n),m=model(c);
 for(let i=0;i<10000;i++){m.trade(1n);if(i%2===0)m.trade(1n,true);m.invariant();}
 m.trade(m.snapshot().s,true);assert.equal(m.snapshot().r,0n);assert.ok(m.snapshot().p+m.snapshot().k>0n);
});
test('exact final lot atomically migrates; failed final CPI leaves selling available',()=>{
 const c=plan(1000n),m=model(c);m.trade(c.b-1n);const old=m.snapshot();
 assert.throws(()=>m.trade(2n));assert.deepEqual(m.snapshot(),old);
 assert.throws(()=>m.trade(1n,false,false));assert.deepEqual(m.snapshot(),old);
 m.trade(1n,true);m.trade(2n);assert.equal(m.snapshot().migrated,true);assert.equal(m.snapshot().r,0n);
 assert.throws(()=>m.trade(1n,true));assert.throws(()=>m.trade(1n));m.invariant();
});
test('minimum lot, fractional dust, fee rounding and lifetime overflow',()=>{
 const c=plan(1000n*1000000000n,1000000000n),m=model(c);assert.throws(()=>m.trade(1n));m.trade(c.q);m.trade(c.q,true);assert.equal(m.snapshot().r,0n);
 for(let raw=1n;raw<10000n;raw++){const f=(raw+99n)/100n;assert.ok(f>0n);assert.ok(f*100n-raw<100n);}
 assert.throws(()=>plan(U64-1n,1n,0n,U64));assert.throws(()=>checked(-1n));
});
test('claims, rent and donations never become redemption or migration principal',()=>{
 const c=plan(1000n),m=model(c);m.trade(10n);const before=m.snapshot();const paid=m.claim();assert.equal(paid,before.p+before.k);assert.throws(()=>m.claim());assert.equal(m.snapshot().withdrawn+(m.snapshot().p+m.snapshot().k-m.snapshot().withdrawn),before.p+before.k);assert.equal(m.snapshot().r,before.r);m.invariant();
 const rent=12345n,donation=678n;assert.equal(before.r+rent+donation-before.r,rent+donation);
});
test('alternative allocations quantify real price discontinuity',()=>{
 const budget=990000n,p=100n;
 for(const tradingPercent of [50n,60n,80n]){const b=budget*tradingPercent/100n,m=budget-b,x=p*b;assert.equal(x*m>0n,true);if(tradingPercent===50n)assert.equal(x,p*m);else assert.ok(x>p*m);}
});
