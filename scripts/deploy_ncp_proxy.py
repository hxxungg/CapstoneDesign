"""NCP(101.79.18.104)에 ai_service 프록시 업로드·실행 (Windows에서도 동작)"""
from __future__ import annotations

import os
import sys
import time

import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PEM = os.path.join(ROOT, "capstonedesign-key.pem")
AI_DIR = os.path.join(ROOT, "ai_service")
REMOTE_DIR = "/root/capstone-ai-proxy"
SSH_HOST = "101.79.18.104"
SSH_USER = "root"
SSH_PASSWORD = os.environ.get("SSH_PASSWORD", "Capstonedesign!")

UPLOAD_FILES = [
    "app.py",
    "model_client.py",
    "requirements.txt",
    ".env.ncp",
]


def main() -> int:
    if not os.path.isfile(PEM):
        print(f"PEM 없음: {PEM}", file=sys.stderr)
        return 1

    key = paramiko.RSAKey.from_private_key_file(PEM)
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(SSH_HOST, username=SSH_USER, pkey=key, password=SSH_PASSWORD, timeout=20)

    client.exec_command(f"mkdir -p {REMOTE_DIR}")
    sftp = client.open_sftp()
    for name in UPLOAD_FILES:
        local = os.path.join(AI_DIR, name)
        if not os.path.isfile(local):
            print(f"파일 없음: {local}", file=sys.stderr)
            return 1
        remote_name = ".env" if name == ".env.ncp" else name
        remote = f"{REMOTE_DIR}/{remote_name}"
        sftp.put(local, remote)
        print(f"uploaded {name} -> {remote}")
    sftp.close()

    deploy_cmd = f"""
cd {REMOTE_DIR}
python3 -m venv .venv
.venv/bin/pip install -q -r requirements.txt
pkill -f 'capstone-ai-proxy.*app.py' 2>/dev/null || true
sleep 1
nohup .venv/bin/python app.py > /var/log/capstone-ai-proxy.log 2>&1 &
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  if curl -sf http://127.0.0.1:8001/health >/tmp/proxy_health.json 2>/dev/null; then
    cat /tmp/proxy_health.json
    exit 0
  fi
  sleep 2
done
echo DEPLOY_LOG_TAIL
tail -30 /var/log/capstone-ai-proxy.log 2>/dev/null || true
exit 1
"""
    _, stdout, stderr = client.exec_command(deploy_cmd, timeout=120)
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    if out:
        print(out)
    if err:
        print(err, file=sys.stderr)

    client.close()

    if '{"status":"ok"}' in out or '"status":"ok"' in out:
        print("PROXY_OK NCP http://101.79.18.104:8001/health")
        return 0

    print("PROXY_FAIL — NCP 로그: /var/log/capstone-ai-proxy.log", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
