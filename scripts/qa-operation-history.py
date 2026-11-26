"""QA-only native WebView test. The probe simulates explicit GUI button clicks.
No real workspaces, production account data or model calls.
"""
import pathlib,sys,subprocess,json,sqlite3,uuid,time
a=pathlib.Path(sys.argv[1])
d=pathlib.Path.home()/'Library/Application Support/com.weepwood.todo.qa.ophistory'
prefix='[HISTORY-QA] '
def db():
 c=sqlite3.connect((d/'todo.sqlite3').as_uri()+'?mode=ro',uri=True)
 return c
def state():
 with db() as c:
  s=json.loads(c.execute("select body from snapshots where scope='guest'").fetchone()[0])
  assert all(t['title'].startswith(prefix) for t in s['tasks'])
  return s
def cli(args,payload=None,code=0):
 r=subprocess.run([str(a/'bin/todo'),'--cli','--data-dir',str(d),*args],input=json.dumps(payload,ensure_ascii=False) if payload else None,text=True,capture_output=True,timeout=35)
 x=json.loads(r.stdout);assert r.returncode==code,(args,r.returncode,x);return x
def run(p,key=None,wait=15,code=0):
 return cli(['run','--file','-','--request-id',key or str(uuid.uuid4()),'--wait',str(wait)],p,code)
def saved(p,key=None):
 r=run(p,key);assert r['status']=='saved',r;return r
def show(id):return saved({'op':'show','id':id})['result']['task']
def history():return saved({'op':'history-list','limit':50})['result']
def start(probe=False):
 p=subprocess.Popen([str(a/'bin'/('todo.probe' if probe else 'todo'))],stdout=open(a/'native-run.log','ab'),stderr=subprocess.STDOUT)
 time.sleep(2);assert p.poll() is None;return p
def stop(p):p.terminate();p.wait(timeout=10)
def byid(id):return next(t for t in state()['tasks'] if t['id']==id)
def waitreceipt(key):
 for _ in range(40):
  x=cli(['status',key],code=0)
  if x['status']=='saved':return x
  time.sleep(.5)
 raise AssertionError(x)
def preview(**kw):return saved({'op':'history-preview',**kw})
def apply(p):return saved({'op':'history-apply','previewId':p['request_id'],'confirm':True})
def passed(name):print('PASS',name,flush=True);checks.append(name)
checks=[]
assert not state()['tasks']
p=start()
try:
 r=saved({'op':'create','tasks':[{'title':prefix+'甲'},{'title':prefix+'乙'}]})
 x,y=r['result']['task_ids'];v1=history()['head'];assert v1>=1
 key=str(uuid.uuid4());q={'op':'update','id':x,'version':show(x)['version'],'fields':{'priority':3}}
 queued=run(q,key,wait=0);assert queued['status']=='received'
 time.sleep(3)
 assert cli(['status',key])['status']=='received' and byid(x)['priority']==0
 passed('unconfirmed clean native app cannot write; request remains pending')
finally:stop(p)
# The probe is a separately compiled QA-only executable that uses actual UI buttons.
p=start(True)
try:
 waitreceipt(key);assert byid(x)['priority']==3
 assert saved(q,key)['status']=='saved'
 v2=history()['head']
 passed('restart asks approval again; simulated UI confirmation commits once')
 denied=run({'op':'update','id':y,'version':show(y)['version'],'fields':{'priority':1}},code=3)
 assert denied['status']=='cancelled' and denied['result']['code']=='USER_CONFIRM_REQUIRED' and byid(y)['priority']==0
 assert history()['head']==v2
 passed('simulated user cancel is terminal; no journal mutation')
 g=str(uuid.uuid4())
 saved({'op':'update','id':x,'version':show(x)['version'],'fields':{'title':prefix+'甲 后续修改'},'operationGroup':g})
 v3=history()['head']
 assert v3>v2
 undo=preview(version=v2,selection=[{'id':x,'fields':['priority']}])
 assert len(undo['result']['rows'])==1
 applied=apply(undo);assert applied['result']['affected']==1
 assert byid(x)['priority']==0 and byid(x)['title'].endswith('后续修改')
 v4=history()['head']
 passed('selective field compensation preserves later title change')
 redo=preview(version=v4);apply(redo)
 assert byid(x)['priority']==3 and byid(x)['title'].endswith('后续修改')
 assert history()['head']>v4
 passed('redo as a new compensation version')
 conflict=preview(version=v2)
 assert not conflict['result']['rows'] and conflict['result']['conflicts']
 passed('intervening same-field changes block old version even after value returns')
 # Undo the unchanged sibling from the original batch. Preserve the edited task.
 undo=preview(version=v1)
 rows=undo['result']['rows'];assert len(rows)==1 and rows[0]['id']==y,(undo,byid(y))
 apply(undo);assert byid(y)['deletedAt'] and not byid(x)['deletedAt']
 passed('batch creation reversal moves untouched task to trash, preserves modified task')
 # Query historical time with selected original fields, not a full snapshot.
 h=preview(afterVersion=v2,selection=[{'id':x,'fields':['title']}])
 assert h['result']['rows'][0]['id']==x
 apply(h);assert byid(x)['title']==prefix+'甲'
 passed('historical point restoration uses new compensation, not snapshot overwrite')
finally:stop(p)
p=start()
try:
 h=history()
 assert h['head']>v4 and len(h['entries'])>=6
 assert byid(y)['deletedAt'] and byid(x)['priority']==3
 assert all(t['title'].startswith(prefix) for t in state()['tasks'])
 with db() as c:
  assert c.execute('pragma integrity_check').fetchone()[0]=='ok'
  counts=dict(c.execute("select status,count(*) from direct_capture_requests where scope='cli-op:guest' group by status"))
  assert counts.get('pending',0)==0
  assert c.execute("select count(*) from operation_history where scope='guest' and request_id=?",[key]).fetchone()[0]==1
  report={'checks':checks,'head':h['head'],'tasks':len(state()['tasks']),'receipts':counts,'integrity':'ok','approval':'actual UI; test clicks simulated in QA-only executable','modelSessions':'not tested'}
  (a/'native-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
  print(json.dumps(report,ensure_ascii=False,indent=2),flush=True)
finally:stop(p)
