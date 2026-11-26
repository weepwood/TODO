import pathlib,json,sys
p=pathlib.Path(sys.argv[1]).resolve()
if p!=pathlib.Path('/Volumes/data/AI-Development/artifacts/TODO/incremental-product-r5/source') or (p/'.git').exists():raise SystemExit('isolated copied source required')
c=p/'src-tauri/tauri.conf.json';v=json.loads(c.read_text())
v['identifier']='com.weepwood.todo.qa.r5';v['productName']='TODO R5 Lab'
v['app']['windows']=[{'label':'main','title':'TODO R5 Lab','width':1180,'height':800,'url':'index.html','backgroundThrottling':'disabled'}]
v['app']['security']['csp']="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src ipc: http://ipc.localhost; img-src 'self' data: blob:; font-src 'self'; worker-src 'self' blob:"
v['bundle']['active']=False;c.write_text(json.dumps(v,indent=2))
d=p/'src-tauri/capabilities'
for f in d.glob('*.json'):f.unlink()
commands=['native-load-store','native-activate','native-operation-history','native-cli-next','native-direct-pending','native-take-quick-capture','native-shortcut-status','native-search','native-cli-binding','native-list-backups','native-read-backup','r5-handshake','r5-commit','r5-enqueue','r5-receipt','r5-report']
(d/'r5.json').write_text(json.dumps({'identifier':'r5','windows':['main'],'permissions':['core:default']+['allow-'+x for x in commands]}))
