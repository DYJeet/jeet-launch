// Economic reference only. No wallet, RPC, program instruction or migration CPI.
import assert from 'node:assert/strict';
import { test } from 'node:test';
export const MAX64=(1n<<64n)-1n, MAX128=(1n<<128n)-1n;
function u(n,max=MAX64){if(typeof n!=='bigint'||n<0n||n>max)throw Error('integer range');return n;}
export function floorSum(n,d,a,b){
 for(const x of [n,d,a,b])u(x);if(!d)throw Error('denominator');let out=0n;
 for(;;){
  if(a>=d){out=u(out+u(n*(n-1n)*(a/d),MAX128)/2n,MAX128);a%=d;}
  if(b>=d){out=u(out+u(n*(b/d),MAX128),MAX128);b%=d;}
  const y=u(a*n+b,MAX128);if(y<d)return out;
  n=y/d;b=y%d;[d,a]=[a,d];
 }
}
export function curve(b,start,growth=3n){
 u(b);u(start);u(growth);if(b<2n||start===0n||growth<1n)throw Error('curve');
 const coefficient=u((growth-1n)*start);u(growth*start);
 const potential=s=>{u(s);if(s>b)throw Error('inventory');return u(start*s+floorSum(s,b-1n,coefficient,b-2n));};
 const price=k=>{u(k);if(k>=b)throw Error('marginal index');return u(start+(coefficient*k+b-2n)/(b-1n));};
 const buy=(s,n)=>{if(n<=0n)throw Error('amount');return u(potential(u(s+n))-potential(s));};
 const sell=(s,n)=>{if(n<=0n||n>s)throw Error('amount');return u(potential(s)-potential(s-n));};
 return {b,start,growth,potential,price,buy,sell};
}
export function partition(s,q=1000000000n,bps=100n){
 u(s);u(q);u(bps);if(!s||q<1n||q>1000000000n||!/^10*$/.test(q.toString())||s%q||bps>500n)throw Error('partition');
 const whole=s/q,creator=whole*bps/10000n,n=whole-creator;
 if(n%5n||n<5n)throw Error('partition granularity');
 const b=n*3n/5n,m=n*2n/5n;if(b<2n)throw Error('inventory');
 return {s,q,a:creator*q,b:b*q,m:m*q,wholeB:b,wholeM:m};
}
export function recommended(s,q=1000000000n,bps=100n){
 const p=partition(s,q,bps),lot=u(1000n*q);
 if(p.b%lot||p.m%lot)throw Error('lot partition');
 const c=curve(p.b/lot,42000n,3n);
 const quote=(soldLots,rawAmount,sell=false)=>{u(rawAmount);if(!rawAmount||rawAmount%lot)throw Error('trade lot');const n=rawAmount/lot;return sell?c.sell(soldLots,n):c.buy(soldLots,n);};
 return {...p,lot,c,quote,x:c.potential(c.b)};
}
test('floor-sum closed form agrees with explicit integer ceiling sums',()=>{
 for(let b=2n;b<80n;b++)for(let a=1n;a<12n;a++){
  const c=curve(b,a);let sum=0n;
  for(let s=0n;s<=b;s++){assert.equal(c.potential(s),sum);if(s<b)sum+=c.price(s);}
 }
});
test('whole-token marginal quotes rise monotonically, exact endpoint growth',()=>{
 for(const g of [2n,3n,5n]){const c=curve(1000n,42n,g);assert.equal(c.price(0n),42n);assert.equal(c.price(999n),42n*g);
 for(let k=1n;k<1000n;k++)assert.ok(c.price(k)>=c.price(k-1n));}
});
test('recommended supply and opening pool ratio are exact integer fixtures',()=>{
 const p=recommended(1000000000000000000n),c=p.c,x=p.x;
 assert.deepEqual([p.a,p.b,p.m],[10000000000000000n,594000000000000000n,396000000000000000n]);
 assert.equal(x,49896296996n);assert.equal(p.a+p.b+p.m,p.s);
 assert.equal(c.price(c.b-1n),126000n);assert.equal(x-126n*p.wholeM,296996n);
 assert.throws(()=>p.quote(0n,1n));assert.equal(p.quote(0n,p.lot),42000n);
 assert.throws(()=>recommended(1000000000n));
});
test('adversarial mixed buy/sell ordering telescopes without surplus or fee reuse',()=>{
 const c=curve(1000000n,42n);let s=0n,r=0n,buys=0n,netSells=0n,pa=0n,ca=0n;
 for(let i=1n;i<=20000n;i++){
  const n=i*17n%31n+1n,isSell=i%3n===0n&&n<=s;
  const raw=isSell?c.sell(s,n):c.buy(s,n),f=(raw+99n)/100n,total=u(pa+ca+f),np=(total*3n+3n)/4n;
  if(isSell){assert.ok(raw>f);s-=n;r-=raw;netSells+=raw-f;}else{s+=n;r+=raw;buys+=raw+f;}
  pa=np;ca=total-np;assert.equal(r,c.potential(s));assert.equal(buys,netSells+r+pa+ca);
 }
 const raw=c.sell(s,s);assert.equal(raw,r);r-=raw;s=0n;assert.equal(r,0n);
});
test('exact final lot, one-over, partial redemption and atomic terminal failure model',()=>{
 const c=curve(594n,42n);let s=590n,r=c.potential(s),migrated=false;const old=[s,r,migrated];
 assert.throws(()=>c.buy(s,5n));assert.deepEqual([s,r,migrated],old);
 const final=c.buy(s,4n);const attempt=ok=>{if(!ok)throw Error('external failure');s+=4n;r+=final;migrated=true;};
 assert.throws(()=>attempt(false));assert.deepEqual([s,r,migrated],old);
 r-=c.sell(s,1n);s--;assert.equal(r,c.potential(s));r+=c.buy(s,1n);s++;
 attempt(true);assert.equal(r,c.potential(c.b));assert.equal(s,c.b);
});
test('zero, negative, dust, invalid partition, maximum values and intermediate overflow',()=>{
 for(const args of [[0n],[1n],[1001n],[MAX64+1n],[1000n,0n],[1000n,1n,501n]])assert.throws(()=>partition(...args));
 assert.equal(partition(5n,1n,0n).a,0n);assert.equal(partition(1000n,1n,500n).a,50n);
 assert.throws(()=>partition(1001n,1n,100n));assert.equal(recommended(5050n,1n).a,50n);assert.equal(recommended(5000n,1n,0n).a,0n);
 const maxWhole=(MAX64/1000000000n)/5000n*5000n;assert.ok(recommended(maxWhole*1000000000n,1000000000n,0n).x<=MAX64);
 assert.throws(()=>floorSum(MAX64,1n,MAX64,MAX64));
 const maxSupply=MAX64-MAX64%5n;assert.equal(partition(maxSupply,1n,0n).s,maxSupply);
 assert.throws(()=>curve(MAX64,MAX64).potential(MAX64));assert.throws(()=>curve(10n,0n));
 assert.throws(()=>curve(10n,1n).sell(0n,1n));assert.throws(()=>floorSum(1n,0n,1n,1n));
 for(let raw=1n;raw<10000n;raw++){const f=(raw+99n)/100n;assert.ok(f>0n);assert.ok(100n*f-raw<100n);}
});
test('alternative curves, large trade slippage and migration allocation separation',()=>{
 const configs=[[495000n,495000n,102000n,1n],[594000n,396000n,42000n,3n],[618750n,371250n,27000n,5n]];
 for(const [b,m,a,g] of configs){const c=curve(b,a,g),x=c.potential(b);assert.ok(x>0n);assert.equal(b+m,990000n);
 assert.equal(c.buy(0n,b),x);assert.equal(c.sell(b,b),x);assert.throws(()=>c.buy(b,1n));
 if(g>1n){assert.ok(c.buy(b-100n,100n)>c.buy(0n,100n));assert.ok(x>c.price(b-1n)*m);}
 }
});
