import json,subprocess,urllib.request,urllib.error,time,uuid
from pathlib import Path
e=dict(l.split('=',1) for l in Path('/etc/new-api/native.env').read_text().splitlines() if '=' in l and not l.startswith('#'))
def sql(q):return subprocess.check_output(['psql',e['SQL_DSN'],'-Atc',q],text=True).strip()
admin=sql('SELECT access_token FROM users WHERE id=1')
def api(path,method='GET',body=None):
 req=urllib.request.Request('http://127.0.0.1:3000'+path,data=None if body is None else json.dumps(body).encode(),headers={'Authorization':'Bearer '+admin,'New-Api-User':'1','Content-Type':'application/json'},method=method)
 j=json.load(urllib.request.urlopen(req,timeout=20));assert j.get('success'),j.get('message');return j
name='banana-verify-'+uuid.uuid4().hex[:10]
import sys
model=sys.argv[1] if len(sys.argv)>1 else 'gemini-3.1-flash-image'
assert model in ['gemini-3.1-flash-image','gemini-3.1-flash-image-preview','gemini-3-pro-image','gemini-3-pro-image-preview']
api('/api/token/','POST',{'name':name,'remain_quota':1000000,'expired_time':int(time.time())+600,'unlimited_quota':False,'model_limits_enabled':True,'model_limits':model,'group':'生图分组-4k'})
tid=None
try:
 t=json.loads(sql("SELECT row_to_json(t) FROM (SELECT id,key FROM tokens WHERE name='"+name+"' AND user_id=1) t"));tid=t['id']
 body={'contents':[{'role':'user','parts':[{'text':'Generate an image of a single blue circle on a white background, no text.'}]}],'generationConfig':{'responseModalities':['TEXT','IMAGE']}}
 req=urllib.request.Request('http://127.0.0.1:3000/v1beta/models/'+model+':generateContent',data=json.dumps(body).encode(),headers={'Authorization':'Bearer sk-'+t['key'],'Content-Type':'application/json'})
 print('requesting relay image',flush=True)
 try:
  with urllib.request.urlopen(req,timeout=150) as r:
   j=json.load(r);parts=[p for c in j.get('candidates',[]) for p in c.get('content',{}).get('parts',[])];print(json.dumps({'http':r.status,'keys':list(j),'image_parts':sum(bool(p.get('inlineData',{}).get('data') or p.get('inline_data',{}).get('data')) for p in parts),'text_parts':sum('text' in p for p in parts),'finish':[c.get('finishReason') for c in j.get('candidates',[])]}),flush=True)
 except urllib.error.HTTPError as x:print('HTTP',x.code,x.read().decode()[:500],flush=True)
 print('logs',sql('SELECT json_agg(row_to_json(l)) FROM (SELECT model_name,channel_id,quota,\"group\",type FROM logs WHERE token_id='+str(tid)+' ORDER BY id DESC LIMIT 2) l'),flush=True)
finally:
 if tid is not None: print('revoked',api('/api/token/'+str(tid),'DELETE')['success'],flush=True)
