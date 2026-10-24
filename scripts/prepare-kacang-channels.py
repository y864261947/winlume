"""Create disabled onboarding channels using an existing key server-side. No secret output."""
import json,subprocess,urllib.request,datetime
from pathlib import Path
e=dict(l.split('=',1) for l in Path('/etc/new-api/native.env').read_text().splitlines() if '=' in l and not l.startswith('#'))
def sql(q):return subprocess.check_output(['psql',e['SQL_DSN'],'-Atc',q],text=True).strip()
key=sql('SELECT key FROM channels WHERE id=158')
token=sql('SELECT access_token FROM users WHERE id=1')
def get(url,auth=False):
 return json.load(urllib.request.urlopen(urllib.request.Request(url,headers={'Authorization':'Bearer '+key} if auth else {}),timeout=30))
pricing=get('https://newapi.prompt-hubs.com/api/pricing')['data']
allowed={r['id'] for r in get('https://newapi.prompt-hubs.com/v1/models',True)['data']}
active=set(sql("SELECT models FROM channels WHERE status=1").replace('\n',',').split(','))
groups={'kc-onboard-images':[],'kc-onboard-video-call':[],'kc-onboard-video-review':[]}
for r in pricing:
 n=r['model_name'];tags=r.get('tags','').split(',')
 if n not in allowed or n in active or 'minimax' in n.lower():continue
 if 'image' in tags:groups['kc-onboard-images'].append(n)
 elif 'video' in tags:
  price=r.get('price',{});unit=price.get('unit');prices=[price.get('request')]+[t.get('request') for t in price.get('tiers',[])]
  bucket='kc-onboard-video-call' if unit=='request' and len(set(prices))==1 else 'kc-onboard-video-review'
  groups[bucket].append(n)
backup=Path('/opt/new-api-native/backups');backup.mkdir(exist_ok=True,mode=0o700)
p=backup/('before-kacang-onboard-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'.json')
p.write_text(sql("SELECT json_agg(row_to_json(c)) FROM channels c WHERE id=158"));p.chmod(0o600)
existing=set(sql('SELECT name FROM channels').splitlines())
for name,models in groups.items():
 if not models:continue
 if name in existing:print(json.dumps({'name':name,'status':'already_exists'}));continue
 channel={'name':name,'type':1 if name.endswith('images') else 64,'key':key,'base_url':'https://newapi.prompt-hubs.com','status':2,'models':','.join(sorted(set(models))),'group':'生图分组' if name.endswith('images') else '视频分组','priority':0,'weight':0,'auto_ban':1,'remark':'待验证：已核对上游目录权限；尚未确认售价与实际生成/结算，保持停用。'}
 req=urllib.request.Request('http://127.0.0.1:3000/api/channel/',data=json.dumps({'mode':'single','channel':channel}).encode(),headers={'Authorization':'Bearer '+token,'New-Api-User':'1','Content-Type':'application/json'},method='POST')
 result=json.load(urllib.request.urlopen(req,timeout=30))
 if not result.get('success'):raise RuntimeError(result.get('message','channel create failed'))
 print(json.dumps({'name':name,'created':True,'status':2,'count':len(models),'models':sorted(models)},ensure_ascii=False))
print('backup:',str(p))
print(sql("SELECT id,name,status,type FROM channels WHERE name LIKE 'kc-onboard-%'"))
