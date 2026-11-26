import json, pathlib, sys
p=pathlib.Path(sys.argv[1]).resolve()
if p!=pathlib.Path('/Volumes/data/AI-Development/artifacts/TODO/incremental-native-r4/source') or (p/'.git').exists():raise SystemExit('isolated artifact source required')
c=p/'src-tauri/tauri.conf.json'
v=json.loads(c.read_text());v['identifier']='com.weepwood.todo.qa.r4';v['productName']='TODO R4 Lab'
v['app']['windows']=[{'label':'main','title':'TODO R4 Lab','width':900,'height':650,'url':'native-r4.html'}]
v['app']['security']['csp']="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src ipc: http://ipc.localhost; img-src 'self' data:; font-src 'self'"
v['bundle']['active']=False;c.write_text(json.dumps(v,indent=2))
d=p/'src-tauri/capabilities'
for f in d.glob('*.json'):f.unlink()
(d/'r4.json').write_text(json.dumps({'identifier':'r4','windows':['main'],'permissions':['core:default']+['allow-r4-'+s for s in ['load','seed','commit','journal','enqueue','receipt','checkpoint','report']]}))
