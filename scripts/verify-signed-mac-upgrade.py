"""Hosted disposable macOS ARM64 runner only. No data directory override or DB mutation."""
import json,os,pathlib,sqlite3,subprocess,time,hashlib,uuid,platform
assert os.environ.get("GITHUB_ACTIONS")=="true" and os.environ.get("GITHUB_REF")=="refs/heads/research/signed-upgrade-20261127"
assert platform.system()=="Darwin" and platform.machine()=="arm64"
out=pathlib.Path("mac-upgrade-evidence");out.mkdir(exist_ok=True)
temp=pathlib.Path(os.environ["RUNNER_TEMP"]);root=temp/"todo-signed-overlay";root.mkdir()
app=root/"TODO.app";exe=app/"Contents/MacOS/todo"
data=pathlib.Path.home()/"Library/Application Support/com.weepwood.todo";db=data/"todo.sqlite3"
assert not data.exists() and not app.exists(),"Existing data or app: refuse"
report={"phase":"start","tests":[],"candidate":"18450487a437c37a836d0ba1a84d642c38daca93","old":"980df78089e6b2628d4f2903373f41d35579ca4e"}
def save(): (out/"report.json").write_text(json.dumps(report,indent=2)+"\n")
def passed(name,**kw):
 report["tests"].append(dict(name=name,**kw));save();print("PASS",name,flush=True)
def wait(fn,seconds=60):
 end=time.monotonic()+seconds;err=None
 while time.monotonic()<end:
  try:
   v=fn()
   if v:return v
  except Exception as e:err=e
  time.sleep(.5)
 raise RuntimeError(f"timeout: {err}")
def state():
 with sqlite3.connect(db.as_uri()+"?mode=ro",uri=True,timeout=2) as c:
  c.execute("BEGIN")
  assert c.execute("pragma integrity_check").fetchall()==[("ok",)]
  rows=c.execute("select scope,body from workspace_store").fetchall();assert len(rows)==1 and rows[0][0]=="guest"
  body=json.loads(json.loads(rows[0][1])["todo-workbench-v1"])
  assert body==json.loads(c.execute("select body from snapshots where scope='guest'").fetchone()[0])
  backups=c.execute("select saved_at,body from backups where scope='guest' order by saved_at").fetchall()
  return body,backups
def receipt(rid):
 with sqlite3.connect(db.as_uri()+"?mode=ro",uri=True) as c:
  return c.execute("select status from direct_capture_requests where scope='cli:guest' and id=?",(rid,)).fetchone()
def install(i):
 v=f"1.2.0-alpha.{i}";d=temp/f"todo-mac-alpha.{i}";dmg=d/f"TODO_{v}_aarch64.dmg";mount=root/f"mount-{i}";mount.mkdir()
 subprocess.run(["hdiutil","verify",str(dmg)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.STDOUT)
 subprocess.run(["hdiutil","attach","-readonly","-nobrowse","-mountpoint",str(mount),str(dmg)],check=True,stdout=subprocess.DEVNULL)
 try:
  source=mount/"TODO.app";assert source.is_dir()
  # Native DMG drag-copy replacement: replace only our disposable installation.
  if app.exists():
   app.rename(root/"previous-TODO.app")
  subprocess.run(["ditto",str(source),str(app)],check=True)
 finally:subprocess.run(["hdiutil","detach",str(mount)],check=True)
 import plistlib
 with (app/"Contents/Info.plist").open("rb") as f:info=plistlib.load(f)
 assert info["CFBundleIdentifier"]=="com.weepwood.todo" and info["CFBundleShortVersionString"]==v
 return hashlib.sha256(exe.read_bytes()).hexdigest()
child=None;log=None
def start(i,digest):
 global child,log
 log=(out/f"alpha{i}-app.log").open("wb")
 child=subprocess.Popen([str(exe)],stdout=log,stderr=subprocess.STDOUT)
 wait(lambda:child.poll() is None and db.exists() and state())
 passed(f"installed macOS app initialized native SQLite alpha.{i}",sha256=digest)
def stop():
 global child,log
 assert child is not None and child.poll() is None
 child.terminate()
 try:child.wait(timeout=15)
 except subprocess.TimeoutExpired:child.kill();child.wait()
 log.close();child=None;log=None
def cli(*args):
 r=subprocess.run([str(exe),"--cli","--data-dir",str(data),*args],capture_output=True,text=True,timeout=45)
 assert r.returncode==0,r.stderr or r.stdout
 return json.loads(r.stdout)
def add(title):
 rid=str(uuid.uuid4());r=cli("add",title,"--list-id","inbox","--request-id",rid,"--wait","30");assert r["status"] in ("received","saved")
 def check():
  s,b=state();tasks=[x for x in s["tasks"] if x["id"]==rid+":1" and x["title"]==title]
  if receipt(rid)==("saved",) and len(tasks)==1:return tasks[0],b
 return rid,wait(check)
def preserved(task,backups):
 s,b=state();assert [x for x in s["tasks"] if x["id"]==task["id"]]==[task];assert backups and all(x in b for x in backups)
try:
 report["phase"]="old";save();h1=install(1);start(1,h1);assert cli("bind","--scope","guest")["bound"]
 rid,(task,backups)=add("QA Mac signed upgrade 1845048");assert backups;passed("old app committed native queue, task and backup")
 stop();preserved(task,backups)
 report["phase"]="overlay";save();h2=install(2);assert h1!=h2;preserved(task,backups);passed("DMG copy replacement preserves original SQLite and backups")
 start(2,h2);preserved(task,backups);assert receipt(rid)==("saved",)
 rid2,(task2,_)=add("QA Mac post-upgrade 1845048");stop()
 preserved(task,backups);preserved(task2,backups);assert receipt(rid2)==("saved",);passed("new app committed task; both tasks and backups survive process stop")
 report["phase"]="passed";save()
except Exception as e:
 report["phase"]="failed";report["error"]=repr(e);save();raise
finally:
 if child is not None:
  if child.poll() is None:child.kill();child.wait()
  if log:log.close()
