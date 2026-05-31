# PEM + 비밀번호로 MySQL SSH 터널 (backend/.env: DB_HOST=127.0.0.1, DB_PORT=13306)
# 또는: ssh -i capstonedesign-key.pem -L 13306:10.0.2.6:3306 root@101.79.18.104 -N
$root = Split-Path $PSScriptRoot -Parent
python (Join-Path $PSScriptRoot "db_tunnel.py")
