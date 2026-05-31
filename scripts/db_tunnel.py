"""SSH 터널: localhost:13306 -> 10.0.2.6:3306 via 101.79.18.104"""
import os
import sys
import time

from sshtunnel import SSHTunnelForwarder

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PEM = os.path.join(ROOT, "capstonedesign-key.pem")
SSH_PASSWORD = os.environ.get("SSH_PASSWORD", "Capstonedesign!")

if not os.path.isfile(PEM):
    print(f"PEM 없음: {PEM}", file=sys.stderr)
    sys.exit(1)

server = SSHTunnelForwarder(
    ("101.79.18.104", 22),
    ssh_username="root",
    ssh_password=SSH_PASSWORD,
    ssh_pkey=PEM,
    remote_bind_address=("10.0.2.6", 3306),
    local_bind_address=("127.0.0.1", 13306),
)
server.start()
print("TUNNEL_OK local=127.0.0.1:13306 -> 10.0.2.6:3306", flush=True)
try:
    while True:
        time.sleep(60)
except KeyboardInterrupt:
    pass
finally:
    server.stop()
