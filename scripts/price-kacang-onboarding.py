"""Add prices for fixed-unit onboarding models only. Channels remain disabled."""
import json,subprocess,urllib.request,datetime,math
from pathlib import Path
e=dict(l.split('=',1) for l in Path('/etc/new-api/native.env').read_text().splitlines() if '=' in l and not l.startswith('#'))
def sql(q):return subprocess.check_output(['psql',e['SQL_DSN'],'-Atc',q],text=True).strip()
token=sql('SELECT access_token FROM users WHERE id=1')
old=sql("SELECT value FROM options WHERE key='ModelPrice'");prices=json.loads(old)
ratios=json.loads(sql("SELECT value FROM options WHERE key='GroupRatio'"))
assert json.loads(sql("SELECT value FROM options WHERE key='GroupGroupRatio'"))=={},'Special group ratios require review'
# Include every positive group ratio, even auto-group routes; refuse free groups.
assert all(float(v)>0 for v in ratios.values()),'Zero-cost group requires review'
min_ratio=min([1.0]+[float(v) for v in ratios.values()])
rows=json.load(urllib.request.urlopen('https://newapi.prompt-hubs.com/api/pricing',timeout=30))['data']
target=set(sql("SELECT models FROM channels WHERE name IN ('kc-onboard-images','kc-onboard-video-call')").replace('\n',',').split(','))
added={};skipped=[]
for r in rows:
 n=r['model_name']
 if n not in target:continue
 if n in prices:skipped.append(n);continue
 blocks=[r.get('price',{})]+list(r.get('group_prices',{}).values())
 if any(b.get('unit') not in ['image','request'] for b in blocks):continue
 amounts=[]
 for b in blocks:
  amounts.append(float(b['request']))
  amounts.extend(float(t['request']) for t in b.get('tiers',[]))
 cost=max(amounts)
 price=math.ceil(cost*1.5/min_ratio*1000000)/1000000
 prices[n]=price;added[n]={'cost_upper_bound':cost,'model_price':price,'min_group_ratio':min_ratio,'minimum_effective_price':round(price*min_ratio,8),'unit':r['price']['unit']}
backup=Path('/opt/new-api-native/backups')/('modelprice-before-onboarding-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'.json');backup.write_text(old);backup.chmod(0o600)
assert sql("SELECT value FROM options WHERE key='ModelPrice'")==old,'Concurrent price change'
if added:
 req=urllib.request.Request('http://127.0.0.1:3000/api/option/',data=json.dumps({'key':'ModelPrice','value':json.dumps(prices,ensure_ascii=False)}).encode(),headers={'Authorization':'Bearer '+token,'New-Api-User':'1','Content-Type':'application/json'},method='PUT')
 j=json.load(urllib.request.urlopen(req,timeout=30));assert j.get('success'),j.get('message')
 saved=json.loads(sql("SELECT value FROM options WHERE key='ModelPrice'"));assert all(saved.get(n)==prices[n] for n in added)
print(json.dumps({'added_prices':added,'existing_prices_preserved_require_review':skipped,'channels_remain_disabled':True,'backup':str(backup)},ensure_ascii=False))
