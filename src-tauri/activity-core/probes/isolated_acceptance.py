"""Run only in temporary directories; no browser profile or real app data."""
import json
import os
from pathlib import Path
import sqlite3
import struct
import subprocess
import sys
import tempfile

def frame(value):
    body = json.dumps(value, separators=(",", ":")).encode()
    return struct.pack("=I", len(body)) + body

def reply(pipe):
    size = struct.unpack("=I", pipe.read(4))[0]
    assert 0 < size <= 65536
    return json.loads(pipe.read(size))

def main():
    collector, ingest, host = map(lambda p: str(Path(p).resolve()), sys.argv[1:])
    with tempfile.TemporaryDirectory(prefix="todo-activity-acceptance-") as root:
        root = Path(root)
        app_db = root / "app.sqlite"
        # Empty allowlist; actual software identifiers never cross the pipe.
        with (root / "resources.txt").open("wb") as stats:
            proc = subprocess.Popen(["/usr/bin/time", "-l", collector, "--isolated", "8"], stdout=subprocess.PIPE, stderr=stats)
            try:
                result = subprocess.run([ingest, "--isolated", str(app_db)], stdin=proc.stdout, capture_output=True, text=True, timeout=20, check=True)
            finally:
                proc.stdout.close()
                try:
                    code = proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait()
                    raise
            assert code == 0
        with sqlite3.connect(app_db) as conn:
            rows = conn.execute("SELECT state,subject,quality,end_ms-start_ms FROM activity_sessions").fetchall()
            assert rows and all(r[1] == "" and r[0] != "active" for r in rows)
            assert conn.execute("PRAGMA integrity_check").fetchone() == ("ok",)
            assert conn.execute("SELECT count(*) FROM diagnostics WHERE kind='stop'").fetchone()[0] == 1
        print(result.stdout.strip(), "native_fixture_states=", sorted(set(r[0] for r in rows)), "stored_ms=", sum(r[3] for r in rows))
        for line in (root / "resources.txt").read_text().splitlines():
            if "real" in line or "maximum resident set size" in line or "peak memory footprint" in line or "instructions retired" in line:
                print(line.strip())
        # Exercise actual binary stdin/stdout framing, host failure and replay.
        ext = "abcdefghijklmnopabcdefghijklmnop"
        db = root / "web.sqlite"
        cmd = [host, "--isolated", str(db), ext, "example.org", f"chrome-extension://{ext}/"]
        invalid = subprocess.run(cmd[:-1]+["chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/"], input=b"", capture_output=True)
        assert invalid.returncode != 0 and not db.exists()
        packet = {"version": 1, "spans": [{"start_ms": 100, "end_ms": 200, "domain": "example.org", "private": False}]}
        p = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            p.stdin.write(frame(packet)); p.stdin.flush()
            # Receive durable-commit ACK, then discard it as a sender would
            # on disconnect before updating its own queue.
            assert reply(p.stdout) == {"ok": True, "inserted": 1}
            p.kill()
            p.wait(timeout=5)
        finally:
            if p.poll() is None:
                p.kill(); p.wait()
            p.stdin.close(); p.stdout.close(); p.stderr.close()
        private = {"version": 1, "spans": [{**packet["spans"][0], "private": True}]}
        p = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        output, error = p.communicate(frame(packet) + frame(private), timeout=5)
        assert p.returncode == 0
        import io
        pipe = io.BytesIO(output)
        assert reply(pipe) == {"ok": True, "inserted": 0}
        assert reply(pipe)["ok"] is False and not pipe.read()
        # Actual process death mid-uncommitted SQLite transaction.
        child = subprocess.Popen([sys.executable, "-c",
            "import sqlite3,sys,time; c=sqlite3.connect(sys.argv[1]); c.execute('BEGIN IMMEDIATE'); c.execute(\"INSERT INTO activity_sessions VALUES(?,?,?,?,?,?,?)\",('fixture','web',200,300,'active','example.org','browser')); print('ready',flush=True); time.sleep(10)", str(db)], stdout=subprocess.PIPE)
        try:
            assert child.stdout.readline() == b"ready\n"
            child.kill(); child.wait(timeout=5)
        finally:
            if child.poll() is None:
                child.kill(); child.wait()
            child.stdout.close()
        with sqlite3.connect(db) as conn:
            assert conn.execute("SELECT count(*),sum(end_ms-start_ms) FROM activity_sessions").fetchone() == (1,100)
            assert conn.execute("PRAGMA integrity_check").fetchone() == ("ok",)
        print("native_host_origin_reject=true framed_roundtrip=true replay_after_kill=true private_reject=true uncommitted_crash_rollback=true")
        print("fixture cleanup automatic; no persistent user data")
if __name__ == "__main__":
    main()
