"""Exercise an already-authorized disposable macOS CLI business candidate.
No production data or credentials. The explicit QA app must be stopped at entry.
"""
import json, pathlib, sqlite3, subprocess, sys, time, uuid
from datetime import date, timedelta
if len(sys.argv)!=3: raise SystemExit("Usage: qa-cli-business.py QA_BINARY QA_REPORT")
binary,report=map(pathlib.Path,sys.argv[1:])
qa=pathlib.Path.home()/"Library/Application Support/com.weepwood.todo.qa.clibusiness"
if not (qa/"todo.sqlite3").is_file():raise SystemExit("QA app must be initialized and authorized first")
prefix="[CLI-BUSINESS-QA] "
stamp=uuid.uuid4().hex[:8]
root=report.parent
def read_state():
 c=sqlite3.connect((qa/"todo.sqlite3").as_uri()+"?mode=ro",uri=True)
 try:
  d=json.loads(c.execute("select body from snapshots where scope='guest'").fetchone()[0])
  assert all(t["title"].startswith(prefix) for t in d["tasks"]), "non-QA data"
  assert c.execute("pragma integrity_check").fetchone()[0]=="ok"
  return d
 finally:c.close()
def cli(args,payload=None,code=0):
 r=subprocess.run([str(binary),"--cli","--data-dir",str(qa),*args],input=json.dumps(payload,ensure_ascii=False) if payload is not None else None,text=True,capture_output=True,timeout=25)
 try: out=json.loads(r.stdout)
 except Exception: raise AssertionError("CLI returned invalid JSON") from None
 assert r.returncode==code,(args,r.returncode,out)
 return out
def run(op,key=None,code=0,wait=15):
 key=key or str(uuid.uuid4())
 return cli(["run","--file","-","--request-id",key,"--wait",str(wait)],op,code)
def saved(op,key=None):
 r=run(op,key)
 assert r["status"]=="saved",r
 return r["result"]
def show(t):return saved({"op":"show","id":t})["task"]
def update(t,op,**fields):
 v=show(t)["version"]
 return saved({"op":op,"id":t,"version":v,**fields})
def start():
 p=subprocess.Popen([str(binary)],stdout=open(root/"qa-native-run.log","ab"),stderr=subprocess.STDOUT)
 time.sleep(2)
 assert p.poll() is None
 return p
def stop(p):
 p.terminate();p.wait(timeout=10)
read_state()
doctor=cli(["doctor"])
assert doctor["scope_kind"]=="guest" and doctor["bound"] and doctor["advanced"] and doctor["operation_api"]==2
checks=[]
def passed(name):
 checks.append(name);print("PASS",name,flush=True)
p=start()
try:
 list_result=saved({"op":"entity-create","kind":"list","name":"CLI QA "+stamp});lst=list_result["id"]
 sec=saved({"op":"entity-create","kind":"section","parentId":lst,"name":"计划"})["id"]
 tag=saved({"op":"entity-create","kind":"tag","name":"CLI QA "+stamp})
 saved({"op":"entity-rename","kind":"tag","id":tag["id"],"version":tag["version"],"name":"CLI QA renamed "+stamp})
 passed("list / section / tag create and rename")
 target=(date.today()+timedelta(days=9)).isoformat()
 # Use distinct days/slots from first real probe and any earlier tests.
 payload={"op":"create","tasks":[{"title":prefix+stamp+" 多时间段","listId":lst,"sectionId":sec,"tags":[tag["id"]],"duration":210,"blocks":[{"date":target,"start":"09:00","end":"10:30"},{"date":target,"start":"14:00","end":"16:00"}],"reminderOffsets":[15,5],"checklist":["代码审查","验证"],"children":[{"title":prefix+stamp+" 子任务"}]}]}
 key=str(uuid.uuid4());r=saved(payload,key);parent,child=r["task_ids"]
 assert saved(payload,key)==r
 assert run({"op":"create","tasks":[{"title":prefix+" conflict"}]},key,code=2)["status"]=="error"
 t=show(parent);assert t["planMinutes"]==90 and t["planSegments"][0]["minutes"]==120 and t["duration"]==210 and len(t["checklist"])==2 and len(t["extraReminders"])==1 and t["tags"]==[tag["id"]]
 assert show(child)["parentId"]==parent and show(child)["sectionId"]==sec
 assert saved({"op":"query","tagId":tag["id"],"q":stamp})["total"]==1
 cal=saved({"op":"calendar","from":target})
 assert len([b for b in cal["blocks"] if b["id"]==parent])==2
 passed("rich multi-block creation / reminders / checklist / child / idempotency / calendar / tag query")
 bad=run({"op":"create","tasks":[{"title":prefix+" overlap","blocks":[{"date":target,"start":"09:15","end":"10:00"}]}]},code=3)
 assert bad["status"]=="cancelled" and "冲突" in bad["result"]["error"]
 stale=t["version"]
 saved({"op":"update","id":parent,"version":stale,"fields":{"notes":"CLI QA verified","priority":3}})
 bad=run({"op":"update","id":parent,"version":stale,"fields":{"priority":1}},code=3)
 assert bad["status"]=="cancelled" and "变化" in bad["result"]["error"]
 update(parent,"update",fields={"planLocked":True})
 bad=run({"op":"update","id":parent,"version":show(parent)["version"],"fields":{"date":(date.today()+timedelta(days=10)).isoformat()}},code=3)
 assert "锁定" in bad["result"]["error"]
 update(parent,"update",fields={"planLocked":False})
 passed("conflict rejection / stale version / lock and unlock")
 repeat_date=(date.today()+timedelta(days=12)).isoformat()
 rep=saved({"op":"create","tasks":[{"title":prefix+stamp+" 循环","date":repeat_date,"time":"08:00","repeat":"daily","interval":2,"repeatCount":4}]})["task_ids"][0]
 bad=run({"op":"update","id":rep,"version":show(rep)["version"],"fields":{"interval":3}},code=3)
 assert "scope=series" in bad["result"]["error"]
 update(rep,"series",scope="series",action="pause");assert show(rep)["seriesHold"]
 update(rep,"series",scope="series",action="resume")
 update(rep,"update",scope="series",fields={"interval":3})
 update(rep,"complete")
 live=saved({"op":"query","view":"recurring","q":stamp+" 循环"})["tasks"]
 assert len(live)==1 and live[0]["date"]==(date.fromisoformat(repeat_date)+timedelta(days=3)).isoformat()
 bad=run({"op":"reopen","id":rep,"version":show(rep)["version"],"confirmSeries":True},code=3)
 assert bad["status"]=="cancelled"
 update(live[0]["id"],"series",scope="series",action="end")
 passed("repeat scope / pause-resume / actual generated occurrence / history reopen rejection / end")
 ordinary=saved({"op":"create","tasks":[{"title":prefix+stamp+" 普通","date":target}]})["task_ids"][0]
 update(ordinary,"move",listId=lst,sectionId=sec);assert show(ordinary)["sectionId"]==sec
 update(ordinary,"postpone",days=1);assert show(ordinary)["date"]==(date.fromisoformat(target)+timedelta(days=1)).isoformat()
 done=update(ordinary,"complete");assert show(ordinary)["status"]=="completed"
 update(ordinary,"undo-completion",**done["undo"]);assert show(ordinary)["status"]=="pending"
 update(ordinary,"complete");update(ordinary,"reopen");assert show(ordinary)["status"]=="pending"
 passed("move / postpone / complete / safe ordinary undo / reopen")
 h=saved({"op":"habit-create","name":"CLI QA "+stamp,"weeklyGoal":5})
 saved({"op":"habit-check","id":h["id"],"version":h["version"],"checked":True})
 cat=saved({"op":"catalog"});assert next(x for x in cat["habits"] if x["id"]==h["id"])["checked"]
 f=saved({"op":"focus-start","version":cat["timerVersion"],"minutes":25,"taskId":ordinary})
 assert f["timer"]["target"]==1500
 f=saved({"op":"focus-change","version":f["timerVersion"],"action":"pause"});assert f["timer"]["startedAt"] is None
 f=saved({"op":"focus-change","version":f["timerVersion"],"action":"resume"});assert f["timer"]["startedAt"] is not None
 f=saved({"op":"focus-change","version":f["timerVersion"],"action":"save"});assert f["timer"] is None
 stats=saved({"op":"stats","period":"day"});assert stats["habitCount"]>=1
 passed("habit create / check / focus start-pause-resume-save / stats")
finally:stop(p)
key=str(uuid.uuid4());queued={"op":"create","tasks":[{"title":prefix+stamp+" 离线批次","repeat":"weekly","date":target}]}
assert run(queued,key,wait=0)["status"]=="received"
p=start()
try:
 for _ in range(30):
  r=cli(["status",key])
  if r["status"]=="saved":break
  time.sleep(.5)
 assert r["status"]=="saved",r
 assert show(r["result"]["task_ids"][0])["repeat"]=="weekly"
 assert saved(queued,key)==r["result"]
 passed("application closed received / restart saved / retry")
finally:stop(p)
state=read_state()
with sqlite3.connect((qa/"todo.sqlite3").as_uri()+"?mode=ro",uri=True) as c:
 receipts=dict(c.execute("select status,count(*) from direct_capture_requests where scope='cli-op:guest' group by status"))
 assert not receipts.get("pending")
 assert c.execute("select count(*) from cli_operation_meta where result is null").fetchone()[0]==0
 report.write_text(json.dumps({"nativeWebView":"actual","qaIdentifier":"com.weepwood.todo.qa.clibusiness","checks":checks,"tasks":len(state["tasks"]),"receipts":receipts,"integrity":"ok","advancedAuthorization":"actual settings probe","realModels":"not tested"},ensure_ascii=False,indent=2)+"\n")
 print(report.read_text(),flush=True)
