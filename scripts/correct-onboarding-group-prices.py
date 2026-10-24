"""Scope new onboarding prices to their actual channel groups; preserve preexisting prices."""
import json,subprocess,urllib.request
from pathlib import Path
from decimal import Decimal,ROUND_CEILING
e=dict(l.split('=',1) for l in Path('/etc/new-api/native.env').read_text().splitlines() if '=' in l and not l.startswith('#'))
def sql(q):return subprocess.check_output(['psql',e['SQL_DSN'],'-Atc',q],text=True).strip()
backup=Path('/opt/new-api-native/backups/modelprice-before-onboarding-20260919T034534Z.json')
previous=json.loads(backup.read_text())
old=sql("SELECT value FROM options WHERE key='ModelPrice'");prices=json.loads(old)
ratios=json.loads(sql("SELECT value FROM options WHERE key='GroupRatio'"))
assert json.loads(sql("SELECT value FROM options WHERE key='GroupGroupRatio'"))=={}
channels=json.loads(sql("SELECT json_agg(row_to_json(c)) FROM (SELECT id,models,\"group\" FROM channels WHERE id IN (243,244)) c"))
model_ratios={}
for c in channels:
 ratio=min(Decimal(str(ratios[g])) for g in c['group'].split(','))
 assert ratio>0
 for n in c['models'].split(','):model_ratios[n]=min(ratio,model_ratios.get(n,ratio))
rows=json.load(urllib.request.urlopen('https://newapi.prompt-hubs.com/api/pricing',timeout=30))['data']
changed={}
for r in rows:
 n=r['model_name']
 if n not in model_ratios or n in previous:continue
 blocks=[r.get('price',{})]+list(r.get('group_prices',{}).values())
 if any(b.get('unit') not in ['image','request'] for b in blocks):continue
 cost=max(Decimal(str(v)) for b in blocks for v in [b['request']]+[t['request'] for t in b.get('tiers',[])])
 ratio=model_ratios[n];price=(cost*Decimal('1.5')/ratio).quantize(Decimal('0.000001'),rounding=ROUND_CEILING)
 prices[n]=float(price);changed[n]={'base':float(price),'group_ratio':float(ratio),'effective':float(price*ratio),'cost_upper_bound':float(cost)}
assert sql("SELECT value FROM options WHERE key='ModelPrice'")==old
req=urllib.request.Request('http://127.0.0.1:3000/api/option/',data=json.dumps({'key':'ModelPrice','value':json.dumps(prices,ensure_ascii=False)}).encode(),headers={'Authorization':'Bearer '+sql('SELECT access_token FROM users WHERE id=1'),'New-Api-User':'1','Content-Type':'application/json'},method='PUT')
j=json.load(urllib.request.urlopen(req,timeout=30));assert j.get('success'),j.get('message')
saved=json.loads(sql("SELECT value FROM options WHERE key='ModelPrice'"));assert all(saved[n]==v for n,v in previous.items());assert all(saved[n]==prices[n] for n in changed)
print(json.dumps({'changed':changed,'preexisting_unchanged':True,'note':'Price only; no generation/settlement validation yet, channels disabled.'},ensure_ascii=False))
