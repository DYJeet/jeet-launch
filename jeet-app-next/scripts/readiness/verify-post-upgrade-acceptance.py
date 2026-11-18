"""Independent finalized public Devnet verification; no wallet keys or submission code."""
import base64, hashlib, json, pathlib, struct, time, urllib.request, urllib.error
ROOT=pathlib.Path(__file__).resolve().parents[2]
OUT=ROOT/'artifacts/public-beta/post-upgrade-acceptance-162ad9f'
OUT.mkdir(parents=True,exist_ok=True)
program='Fs39Nso7hzYw84u75RzSLTUE9YrD8zgkk1bLfgAiX72D'
creator='13TckZDu8H8VAXSmkfGqVKMwbeWoJsrsBSk5i1KkA1Uf'
trader='9m9k7oUP2EpVhgPXtrAsFTYE6WY6kaq8w67QvkWKjx9b'
expected='e4516444814532383d1dce55dd84f0b88dacbb35435f738596b1c7fb725e2e2c'
signatures=[('buy','2xnBhZTAZmSvq1nDfYdWSGR61xMHuq8NMaZJzU35ZeEmhDkCM4qVNEDN8G1Vy5vhqTsiFwn8AgYCTfR4CKQYEYZD'),('sell','4pysWS3aMGXskDizCP1TkQqTfMYttJVQc4qqwd2HsCQkSXHGHUzTZNBDmbZrmEDAxbnHtmnddTSJ7RXuKavnkchi'),('claim','2eLQazZvEHVu5EG3zTahQpUL7PU7hKW133Dgo1YBk44j5Zx3DnrpqddtLcX2U8zu76HwrbrWWokJ2HbzKGCUHCMd')]
def rpc(method,params=[]):
 for attempt in range(3):
  time.sleep(.5)
  req=urllib.request.Request('https://api.devnet.solana.com',data=json.dumps({'jsonrpc':'2.0','id':1,'method':method,'params':params}).encode(),headers={'Content-Type':'application/json'})
  try:
   with urllib.request.urlopen(req,timeout=15) as r: d=json.load(r)
   assert 'error' not in d,d.get('error'); return d['result']
  except urllib.error.HTTPError as e:
   if e.code!=429 or attempt==2: raise
   time.sleep(2**attempt)
 raise RuntimeError('Bounded RPC attempts exhausted')
def b58(b):
 alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';n=int.from_bytes(b,'big');s=''
 while n:n,r=divmod(n,58);s=alphabet[r]+s
 return '1'*(len(b)-len(b.lstrip(b'\0')))+s
def u64(b,at):return struct.unpack_from('<Q',b,at)[0]
assert rpc('getGenesisHash')=='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG'
statuses=rpc('getSignatureStatuses',[[s for _,s in signatures],{'searchTransactionHistory':True}])
assert all(x and x['err'] is None and x['confirmationStatus']=='finalized' for x in statuses['value'])
receipts=[]
for index,(label,sig) in enumerate(signatures):
 tx=rpc('getTransaction',[sig,{'encoding':'json','commitment':'finalized','maxSupportedTransactionVersion':0}])
 assert tx and tx['meta']['err'] is None and tx['meta']['fee']==5000
 assert tx['transaction']['signatures']==[sig]
 keys=tx['transaction']['message']['accountKeys'];payer=creator if label=='claim' else trader
 assert keys[0]==payer
 assert all(keys[ix['programIdIndex']] in [program,'ComputeBudget111111111111111111111111111111'] for ix in tx['transaction']['message']['instructions'])
 assert tx['meta']['preBalances'][0]==[837776,728545,13626922][index]
 assert tx['meta']['postBalances'][0]==[728545,825712,13622644][index]
 if label!='claim':
  def balance(field):return sum(int(b['uiTokenAmount']['amount']) for b in tx['meta'][field] if b.get('owner')==trader)
  assert balance('postTokenBalances')-balance('preTokenBalances')==(2400000000000 if label=='buy' else -2400000000000)
 (OUT/(label+'-independent-finalized-transaction.json')).write_text(json.dumps(tx,indent=2)+'\n')
 receipts.append({'label':label,'signature':sig,'slot':tx['slot'],'feeLamports':5000,'finalized':True,'error':None,'explorer':'https://explorer.solana.com/tx/'+sig+'?cluster=devnet'})
life=json.loads((ROOT/'artifacts/devnet/fee-65-35/lifecycle-jeettest/summary.json').read_text());ad=life['addresses']
keys=[program,'4UHVfUkA2HxHRo11hcN3FH8QjX6ZYznikSvA678cxQVW',creator,trader,life['mint'],ad['curve'],ad['platformVault'],ad['creatorVault'],ad['traderDestination'],ad['vault'],ad['migrationVault'],ad['creatorAta']]
snap=rpc('getMultipleAccounts',[keys,{'encoding':'base64','commitment':'finalized'}]);a=snap['value']
data=lambda i:base64.b64decode(a[i]['data'][0])
assert a[0]['executable'] and a[0]['owner']=='BPFLoaderUpgradeab1e11111111111111111111111'
binary=(ROOT/'artifacts/readiness/candidates/syncnative-devnet/jeet_launch_custody.so').read_bytes();pd=data(1)
assert hashlib.sha256(binary).hexdigest()==expected
assert hashlib.sha256(pd[45:45+len(binary)]).hexdigest()==expected and not any(pd[45+len(binary):])
assert b58(data(0)[4:36])==keys[1] and pd[12]==1 and b58(pd[13:45])=='DQeELacwEfej1r9g5pt4eQQcetxe3TAgVGD9RJSutJNW'
assert a[2]['lamports']==13622644 and a[3]['lamports']==825712
assert u64(data(4),36)==1000000000000000000 and data(4)[44]==9
assert struct.unpack_from('<I',data(4),0)[0]==0 and struct.unpack_from('<I',data(4),46)[0]==0
assert data(5)[:8]==b'JEETCRV5' and u64(data(5),128)==0 and u64(data(5),136)==0 and u64(data(5),228)==4
assert u64(data(5),204)==u64(data(5),212) and data(5)[261]==0
assert a[5]['lamports']==1981200
assert b58(data(6)[72:104])=='HVx69FZYW1bBkyK3RaVLNhhAPETZK9tA7E3CrHjrJ1wP'
assert b58(data(7)[72:104])==creator
assert [u64(data(6),x) for x in [105,113,121]]==[2684,0,2684]
assert [u64(data(7),x) for x in [105,113,121]]==[1444,1444,0]
assert [u64(data(i),64) for i in [8,9,10,11]]==[0,594000000000000000,396000000000000000,10000000000000000]
assert 594000000000000000+396000000000000000+10000000000000000==1000000000000000000
gross=104231+sum(r['feeLamports'] for r in receipts);net=837776+13626922-a[2]['lamports']-a[3]['lamports']
assert gross==119231 and gross<=200000 and net==16342 and net==15000+1342
report={'status':'PASS','verification':'independent finalized public Devnet RPC; no signing keys','verifiedSlot':snap['context']['slot'],'program':program,'artifactSha256':expected,'upgradeAuthority':'DQeELacwEfej1r9g5pt4eQQcetxe3TAgVGD9RJSutJNW','treasury':'HVx69FZYW1bBkyK3RaVLNhhAPETZK9tA7E3CrHjrJ1wP','mint':life['mint'],'feeBps':{'platform':65,'creator':35,'total':100},'receipts':receipts,'finalBalancesLamports':{'creator':13622644,'trader':825712},'grossDebitLamports':gross,'networkFeesLamports':15000,'creatorClaimReceivedLamports':722,'netWalletDecreaseLamports':net,'remainingAdditionalGrossCapLamports':200000-gross,'remainingHistoricalExternalSpendingAllowanceLamports':19049698-net,'conservativeAllowanceAfterGrossReservationLamports':19049698-gross,'newPlatformFeesLamports':1342,'newCreatorFeesLamports':722,'finalPlatformAccruedLamports':2684,'finalCreatorAccruedLamports':1444,'finalCreatorClaimedLamports':1444,'finalReserveLamports':0,'finalTraderTokensRaw':0,'supplyConserved':True,'authoritiesUnchanged':True,'newToken':False,'migration':False,'platformClaim':False,'mainnetActivity':False,'productionChange':False,'failedOnChainTransactions':0}
(OUT/'independent-finalized-verification.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
