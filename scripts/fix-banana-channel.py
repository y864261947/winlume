import json,subprocess,urllib.request,datetime
from pathlib import Path
e=dict(l.split('=',1) for l in Path('/etc/new-api/native.env').read_text().splitlines() if '=' in l and not l.startswith('#'))
def sql(q):return subprocess.check_output(['psql',e['SQL_DSN'],'-Atc',q],text=True).strip()
raw=sql('SELECT row_to_json(c) FROM channels c WHERE id=247');c=json.loads(raw);assert c['type']==1
p=Path('/opt/new-api-native/backups')/('banana-247-before-gemini-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'.json');p.write_text(raw);p.chmod(0o600)
c={k:v for k,v in c.items() if k in ['id','name','base_url','models','group','priority','weight','auto_ban','setting','settings','model_mapping','param_override','header_override','remark']};c['type']=24
t=sql('SELECT access_token FROM users WHERE id=1')
req=urllib.request.Request('http://127.0.0.1:3000/api/channel/',data=json.dumps(c).encode(),headers={'Authorization':'Bearer '+t,'New-Api-User':'1','Content-Type':'application/json'},method='PUT')
j=json.load(urllib.request.urlopen(req,timeout=30));assert j.get('success'),j.get('message')
saved=json.loads(sql('SELECT row_to_json(c) FROM channels c WHERE id=247'));old=json.loads(raw)
assert saved['type']==24
for k in ['key','models','group','status','base_url']:assert saved[k]==old[k],k
print(json.dumps({'id':247,'type':24,'preserved':['key','models','group','status','base_url'],'backup':str(p)}))
