import configparser
import os
import socket
import subprocess
from pathlib import Path

from .db import DB_PATH


CERT_DIR = Path(DB_PATH).resolve().parent / "certs"
CERT_FILE = CERT_DIR / "inventory-cert.pem"
KEY_FILE = CERT_DIR / "inventory-key.pem"


def _local_ips() -> list[str]:
    ips = {"127.0.0.1"}
    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None):
            ip = info[4][0]
            if ":" not in ip:
                ips.add(ip)
    except Exception:
        pass
    # Discover the address used for outbound LAN traffic when possible.
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("10.255.255.255", 1))
            ips.add(sock.getsockname()[0])
    except Exception:
        pass
    return sorted(ips)


def ensure_certificate() -> tuple[str, str]:
    CERT_DIR.mkdir(parents=True, exist_ok=True)
    if CERT_FILE.exists() and KEY_FILE.exists():
        return str(CERT_FILE), str(KEY_FILE)

    ips = _local_ips()
    san_entries = ["DNS:localhost"] + [f"IP:{ip}" for ip in ips]
    config_path = CERT_DIR / "openssl.cnf"
    config = configparser.ConfigParser()
    # Write a raw OpenSSL config rather than using ConfigParser's INI format.
    with open(config_path, "w", encoding="utf-8") as f:
        f.write("[req]\n")
        f.write("distinguished_name=req_dn\n")
        f.write("req_extensions=req_ext\n")
        f.write("prompt=no\n")
        f.write("[req_dn]\n")
        f.write("CN=Inventory Suite Localhost\n")
        f.write("[req_ext]\n")
        f.write("subjectAltName=" + ",".join(san_entries) + "\n")
        f.write("basicConstraints=CA:FALSE\n")
        f.write("keyUsage=digitalSignature,keyEncipherment\n")
        f.write("extendedKeyUsage=serverAuth\n")

    subprocess.run(
        [
            "openssl", "req", "-x509", "-nodes", "-newkey", "rsa:2048",
            "-keyout", str(KEY_FILE),
            "-out", str(CERT_FILE),
            "-days", "365",
            "-config", str(config_path),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        os.chmod(KEY_FILE, 0o600)
    except Exception:
        pass

    fingerprint = subprocess.check_output(
        ["openssl", "x509", "-in", str(CERT_FILE), "-noout", "-fingerprint", "-sha256"],
        text=True,
    ).strip()
    print(f"[Inventory Suite] TLS certificate created at {CERT_FILE}")
    print(f"[Inventory Suite] Certificate SANs: {', '.join(san_entries)}")
    print(f"[Inventory Suite] SHA-256 fingerprint: {fingerprint}")
    print("[Inventory Suite] Install/trust this certificate on client devices to avoid browser warnings.")
    return str(CERT_FILE), str(KEY_FILE)
