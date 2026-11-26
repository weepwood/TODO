"""Real local CLI/WebView verification in a specifically named disposable QA DB."""
import json, pathlib, sqlite3, subprocess, sys, time, uuid
from datetime import date, timedelta
binary,report=map(pathlib.Path,sys.argv[1:])
qa=pathlib.Path.home()/"Library/Application Support/com.weepwood.todo.qa.climanagement"
root=report.parent
prefix="[CLI-MGMT-QA] "
def snapshot():
 with sqlite3.connect((qa/"todo.sqlite3").as_uri()+"?mode=ro",uri=True) as c:
  state=json.loads(c.execute("SELECT body FROM snapshots WHERE scope='guest'").fetchone()[0])
  assert all(t["title"].startswith(prefix) for t in state["tasks"])
  assert c.execute("PRAGMA integrity_check").fetchone()[0]=="ok"
  return state
def cli(args,payload=None,code=0):
 r=subprocess.run([str(binary),"--cli","--data-dir",str(qa),*args],input=json.dumps(payload,ensure_ascii=False) if payload is not None else None,text=True,capture_output=True,timeout=25)
 out=json.loads(r.stdout);assert r.returncode==code,(args,r.returncode,out)
 return out
def run(op,key=None,code=0,wait=10):
 return cli(["run","--file","-","--request-id",key or str(uuid.uuid4()),"--wait",str(wait)],op,code)
def saved(op,key=None):
 r=run(op,key);assert r["status"]=="saved",r
 return r
def show(id):return saved({"op":"show","id":id})["result"]["task"]
def reject(op,code):
 r=run(op,code=3);assert r["result"]["code"]==code,r
 return r
def apply(p,confirm=True,key=None):
 return saved({"op":"preview-apply","previewId":p["request_id"],"confirm":confirm},key)
checks=[]
def passed(s): checks.append(s);print("PASS",s,flush=True)
d=cli(["doctor"]);assert d["advanced"] and d["bound"] and d["scope_kind"]=="guest" and d["operation_api"]==3
assert not snapshot()["tasks"]
day=(date.today()+timedelta(days=2)).isoformat()
day2=(date.today()+timedelta(days=3)).isoformat()
day3=(date.today()+timedelta(days=4)).isoformat()
p=subprocess.Popen([str(binary)],stdout=open(root/"native-run.log","ab"),stderr=subprocess.STDOUT)
try:
 time.sleep(2);assert p.poll() is None
 r=saved({"op":"create","tasks":[{"title":prefix+"固定","blocks":[{"date":day,"start":"10:00","end":"10:30"}],"planLocked":True},{"title":prefix+"候选A","date":day,"duration":45,"deadline":day+"T11:15","priority":3},{"title":prefix+"候选B","date":day,"duration":60,"deadline":day+"T11:15","priority":2}]})
 fixed,a,b=r["result"]["task_ids"]
 context=saved({"op":"context","date":day,"days":1,"start":"09:00","end":"11:15","ignoreWeek":True})["result"]
 assert context["counts"]["pending"]==3 and context["capacity"][0]["planned"]==105
 assert len(context["calendar"])==1 and all(x["version"] for x in context["rows"])
 expl=saved({"op":"plan-explain","id":a,"date":day,"start":"09:00","end":"11:15","ignoreWeek":True})["result"]
 assert expl["evaluation"]["id"]==a
 passed("context / real capacity / task version / feasibility explanation")
 payload={"op":"plan-preview","date":day,"start":"09:00","end":"11:15","ignoreWeek":True}
 before=snapshot();plan=saved(payload);assert snapshot()==before
 assert len(plan["result"]["rows"])==2
 reject({"op":"preview-apply","previewId":plan["request_id"],"confirm":False},"CONFIRM_REQUIRED")
 reject({"op":"preview-apply","previewId":str(uuid.uuid4()),"confirm":True},"REFERENCE_INVALID")
 key=str(uuid.uuid4());ap=apply(plan,key=key);assert ap["result"]["affected"]==2 and ap["result"]["undo"]["supported"]
 assert apply(plan,key=key)==ap
 reject({"op":"preview-apply","previewId":plan["request_id"],"confirm":True},"STALE_VERSION")
 s=snapshot();assert next(t for t in s["tasks"] if t["id"]==fixed)==next(t for t in before["tasks"] if t["id"]==fixed)
 assert {t["time"] for t in s["tasks"] if t["id"] in [a,b]}=={"09:00","10:30"}
 u=saved({"op":"changes-undo","receiptId":ap["request_id"],"confirm":True})
 assert u["result"]["affected"]==2 and all(not t["time"] for t in snapshot()["tasks"] if t["id"] in [a,b])
 reject({"op":"changes-undo","receiptId":ap["request_id"],"confirm":True},"STALE_VERSION")
 passed("immutable preview / confirm / actual plan / same UUID / safe undo / stale reference")
 ap=apply(saved(payload))
 t1,t2=show(a),show(b)
 # Priority batch avoids rescheduling the actual chosen time slots.
 batch=saved({"op":"changes-preview","changes":[{"id":a,"version":t1["version"],"fields":{"priority":1}},{"id":b,"version":t2["version"],"fields":{"priority":3}}]})
 assert batch["result"]["rows"] and show(a)["priority"]==3
 changed=apply(batch);assert changed["result"]["affected"]==2
 assert show(a)["priority"]==1 and show(b)["priority"]==3
 saved({"op":"changes-undo","receiptId":changed["request_id"],"confirm":True})
 assert show(a)["priority"]==3
 stale=saved({"op":"changes-preview","changes":[{"id":a,"version":show(a)["version"],"fields":{"priority":1}}]})
 saved({"op":"update","id":a,"version":show(a)["version"],"fields":{"notes":"QA change"}})
 reject({"op":"preview-apply","previewId":stale["request_id"],"confirm":True},"STALE_VERSION")
 passed("atomic batch / exact inverse / intervening edit rejection")
 parent=saved({"op":"create","tasks":[{"title":prefix+"分解","duration":120,"date":day3}]})["result"]["task_ids"][0]
 split=saved({"op":"split-preview","id":parent,"version":show(parent)["version"],"children":[{"title":prefix+"阅读","duration":30,"checklist":["核对"]},{"title":prefix+"实现","duration":90,"after":[1]}]})
 assert split["result"]["analysis"]["estimatedMinutes"]==120 and len(split["result"]["rows"])==2
 spl=apply(split);assert not spl["result"]["undo"]["supported"]
 children=[r["id"] for r in spl["result"]["rows"]]
 assert show(children[1])["dependsOn"]==[children[0]] and show(children[0])["parentId"]==parent
 passed("task decomposition / existing child and dependency models")
 fixtures=saved({"op":"create","allowConflict":True,"tasks":[{"title":prefix+"锁定重排","blocks":[{"date":day2,"start":"10:00","end":"10:30"}],"planLocked":True},{"title":prefix+"移动重排","date":day2,"time":"10:15","duration":30},{"title":prefix+"不变重排","date":day2,"time":"14:00","duration":30}]})["result"]["task_ids"]
 re=saved({"op":"reflow-preview","date":day2,"start":"09:00","end":"18:00","ignoreWeek":True})
 assert len(re["result"]["rows"])==1 and re["result"]["rows"][0]["id"]==fixtures[1]
 apply(re);assert show(fixtures[1])["time"]=="10:30" and show(fixtures[0])["time"]=="10:00" and show(fixtures[2])["time"]=="14:00"
 passed("rolling reflow / fixed and unrelated tasks preserved")
 saved({"op":"create","tasks":[{"title":prefix+"重复候选"},{"title":prefix+"重复候选"}]})
 audit=saved({"op":"audit","ageDays":1})["result"];assert audit["duplicateGroupsTotal"]==1 and audit["backlogTotal"]==0
 review=saved({"op":"review","period":"week"})["result"];assert review["calibration"]["count"]==0 and review["calibration"]["mae"] is None
 passed("audit duplicate candidate / review unknown calibration")
finally:
 p.terminate();p.wait(timeout=10)
s=snapshot()
with sqlite3.connect((qa/"todo.sqlite3").as_uri()+"?mode=ro",uri=True) as c:
 counts=dict(c.execute("SELECT status,count(*) FROM direct_capture_requests WHERE scope='cli-op:guest' GROUP BY status"))
 assert counts.get("pending",0)==0
 report.write_text(json.dumps({"qaIdentifier":"com.weepwood.todo.qa.climanagement","nativeWebView":"actual","checks":checks,"tasks":len(s["tasks"]),"receipts":counts,"integrity":"ok","modelSessions":"not tested"},ensure_ascii=False,indent=2)+"\n")
print(report.read_text())
