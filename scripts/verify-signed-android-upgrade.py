"""Real installed nondebuggable APKs only; no root, run-as, CDP, or DB injection."""
import os,json,pathlib,subprocess,time,re,xml.etree.ElementTree as ET
assert os.environ.get("GITHUB_ACTIONS")=="true" and os.environ.get("GITHUB_REF")=="refs/heads/research/signed-upgrade-20261127"
out=pathlib.Path("android-upgrade-evidence");out.mkdir(exist_ok=True)
temp=pathlib.Path(os.environ["RUNNER_TEMP"]);pkg="com.weepwood.todo"
report={"phase":"start","tests":[],"candidate":"18450487a437c37a836d0ba1a84d642c38daca93","old":"980df78089e6b2628d4f2903373f41d35579ca4e"}
def save(): (out/"report.json").write_text(json.dumps(report,indent=2)+"\n")
def passed(name,**kw):report["tests"].append(dict(name=name,**kw));save();print("PASS",name,flush=True)
def adb(*args,timeout=30):
 return subprocess.check_output(["adb",*args],timeout=timeout).decode("utf-8",errors="replace").strip()
def wait(fn,seconds=45):
 end=time.monotonic()+seconds;err=None
 while time.monotonic()<end:
  try:
   v=fn()
   if v:return v
  except Exception as e:err=e
  time.sleep(.8)
 raise RuntimeError(f"timeout: {err}")
def screen(name):
 (out/(name+".png")).write_bytes(subprocess.check_output(["adb","exec-out","screencap","-p"],timeout=20))
def dump(label="ui"):
 adb("shell","uiautomator","dump","/sdcard/todo-upgrade-ui.xml",timeout=40)
 xml=adb("shell","cat","/sdcard/todo-upgrade-ui.xml")
 (out/(label+".xml")).write_text(xml)
 return list(ET.fromstring(xml).iter("node"))
def match(nodes,value):
 return [n for n in nodes if value in [n.attrib.get("text"),n.attrib.get("content-desc")]]
def tap(node):
 coords=list(map(int,re.findall(r"\d+",node.attrib["bounds"])));assert len(coords)==4 and coords[2]>coords[0] and coords[3]>coords[1]
 adb("shell","input","tap",str((coords[0]+coords[2])//2),str((coords[1]+coords[3])//2))
def exactly(value):
 nodes=dump();matched=match(nodes,value)
 assert len(matched)==1,f"Expected unique accessible {value}, got {len(matched)}"
 return matched[0]
def has_task(title,label):
 return bool(match(dump(label),title))
def info():
 raw=adb("shell","dumpsys","package",pkg)
 def field(pattern):
  m=re.search(pattern,raw);assert m,pattern;return m.group(1)
 return dict(versionCode=int(field(r"versionCode=(\d+)")),versionName=field(r"versionName=([^\s]+)"),uid=int(field(r"\b(?:userId|appId)=(\d+)")),firstInstallTime=field(r"firstInstallTime=([^\r\n]+)"))
def install(i):
 apk=temp/f"todo-android-alpha.{i}"/f"TODO_1.2.0-alpha.{i}_arm64.apk"
 args=["install"]+(["-r"] if i==2 else [])+[str(apk)]
 assert "Success" in adb(*args,timeout=120)
 data=info();report["installedPackage"]=data;save();assert data["versionCode"]==102000+i and data["versionName"]==f"1.2.0-alpha.{i}", data
 return data
def launch():
 component=adb("shell","cmd","package","resolve-activity","--brief","-a","android.intent.action.MAIN","-c","android.intent.category.LAUNCHER",pkg).splitlines()[-1]
 assert component.startswith(pkg+"/")
 assert "Error" not in adb("shell","am","start","-W","-n",component)
 def focused():
  focus=next((l for l in adb("shell","dumpsys","window").splitlines() if "mCurrentFocus=" in l),"")
  return pkg+"/" in focus
 wait(focused)
def add(title):
 tap(wait(lambda:exactly("新任务名称")))
 adb("shell","input","text",title)
 tap(wait(lambda:exactly("添加")))
 wait(lambda:has_task(title,"task-"+title))
def relaunch():
 adb("shell","am","force-stop",pkg);launch()
try:
 devices=[l.split() for l in adb("devices").splitlines()[1:] if l.strip()]
 assert len(devices)==1 and devices[0][0].startswith("emulator-") and devices[0][1]=="device"
 assert adb("shell","getprop","ro.kernel.qemu")=="1"
 assert not any(x=="package:"+pkg for x in adb("shell","pm","list","packages",pkg).splitlines()), "Refuse existing app"
 abi=adb("shell","getprop","ro.product.cpu.abilist").split(",")
 report["abi"]=abi;save()
 if "arm64-v8a" not in abi:
  report["phase"]="blocked-abi";save();raise RuntimeError("Emulator does not advertise ARM64 support; original APK must not be replaced")
 passed("disposable emulator advertises ARM64 ABI",abi=abi)
 report["phase"]="old-install";save();old=install(1);adb("shell","input","keyevent","82");launch();passed("installed original Alpha.1",package=old)
 title="QAUpgrade1845048Old";new="QAUpgrade1845048New"
 add(title);screen("old-task");relaunch();wait(lambda:has_task(title,"old-relaunch"));passed("old app created task and retained after force-stop/relaunch")
 adb("shell","am","force-stop",pkg)
 report["phase"]="overlay";save();current=install(2)
 assert current["uid"]==old["uid"] and current["firstInstallTime"]==old["firstInstallTime"],"Unexpected new package installation"
 launch();wait(lambda:has_task(title,"new-retained"));screen("new-retained")
 passed("actual signed APK overlay preserves package identity and visible old task",package=current)
 add(new);screen("new-task");relaunch()
 wait(lambda:has_task(title,"final-old") and has_task(new,"final-new"))
 passed("both tasks visible after new app force-stop/relaunch");report["phase"]="passed";save()
except Exception as e:
 if report["phase"]!="blocked-abi":report["phase"]="failed"
 report["error"]=repr(e);save()
 try:screen("failure")
 except Exception:pass
 raise
