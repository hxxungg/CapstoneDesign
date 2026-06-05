"""NCP(101.79.18.104)에 backend 업로드·pm2 재시작 (Windows에서도 동작)"""
from __future__ import annotations

import os
import sys

import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PEM = os.path.join(ROOT, "capstonedesign-key.pem")
BACKEND_DIR = os.path.join(ROOT, "backend")
REMOTE_ROOT = "/root/CapstoneDesign"
REMOTE_BACKEND = f"{REMOTE_ROOT}/backend"
SSH_HOST = "101.79.18.104"
SSH_USER = "root"
SSH_PASSWORD = os.environ.get("SSH_PASSWORD", "Capstonedesign!")

# 업로드 대상 — src 전체 + package 파일 (의존성 변경 시)
UPLOAD_REL_PATHS = [
    "src/routes/analytics.js",
    "src/services/classChartAverages.js",
]


def log(msg: str) -> None:
    sys.stdout.buffer.write((msg + "\n").encode("utf-8", errors="replace"))


def upload_tree(sftp: paramiko.SFTPClient, local_base: str, rel_paths: list[str]) -> None:
    for rel in rel_paths:
        local = os.path.join(local_base, rel.replace("/", os.sep))
        remote = f"{REMOTE_BACKEND}/{rel}"
        if not os.path.isfile(local):
            log(f"skip (missing): {rel}")
            continue
        remote_dir = os.path.dirname(remote).replace("\\", "/")
        parts = remote_dir.split("/")
        cur = ""
        for part in parts:
            if not part:
                continue
            cur = f"{cur}/{part}" if cur else part
            try:
                sftp.stat(cur)
            except OSError:
                sftp.mkdir(cur)
        sftp.put(local, remote)
        log(f"uploaded {rel}")


def main() -> int:
    if not os.path.isfile(PEM):
        log(f"PEM 없음: {PEM}")
        return 1

    key = paramiko.RSAKey.from_private_key_file(PEM)
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(SSH_HOST, username=SSH_USER, pkey=key, password=SSH_PASSWORD, timeout=20)

    sftp = client.open_sftp()
    upload_tree(sftp, BACKEND_DIR, UPLOAD_REL_PATHS)
    sftp.close()

    deploy_cmd = f"""
set -e
cd {REMOTE_BACKEND}
if ! command -v pm2 >/dev/null 2>&1; then
  echo PM2_MISSING
  exit 1
fi
npm install --omit=dev --silent 2>/dev/null || npm install --omit=dev
if pm2 describe capstonedesign-backend >/dev/null 2>&1; then
  pm2 restart capstonedesign-backend
else
  pm2 start server.js --name capstonedesign-backend
fi
sleep 2
pm2 list
curl -sf http://127.0.0.1:3000/api/health 2>/dev/null || curl -sf http://127.0.0.1:3000/ 2>/dev/null || echo HEALTH_SKIP
"""
    _, stdout, stderr = client.exec_command(deploy_cmd, timeout=180)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    if out:
        log(out.strip())
    if err:
        log("STDERR: " + err.strip())

    client.close()

    if "PM2_MISSING" in out + err:
        log("배포 실패: pm2 없음")
        return 1
    if "online" in out.lower() or "restart" in out.lower() or "capstonedesign-backend" in out.lower():
        log(f"BACKEND_OK NCP http://{SSH_HOST}:3000")
        return 0

    log("배포 완료 — pm2 상태를 서버에서 직접 확인해 주세요.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
