#!/usr/bin/env python3
"""
Non-interactive SSH helper for Windows agent environments (paramiko).

Plain `ssh user@host` hangs on password prompts here. This script connects with
password (or key), runs one command, or SFTP put/get.

Usage:
    python ssh_run.py <host> <user> <password> "<command>"
    python ssh_run.py <host> <user> <password> --file commands.txt
    python ssh_run.py <host> <user> <password> --put <local> <remote>
    python ssh_run.py <host> <user> <password> --get <remote> <local>
    python ssh_run.py <host> <user> --key <path> "<command>"
    python ssh_run.py <host> <user> --env-password "<command>"
        # password from env DEPLOY_SSH_PASSWORD or APP_SERVER_SSH_PASSWORD

Optional:
    --timeout <seconds>   command timeout (default 120)

Notes for Windows callers:
  - Prefer PowerShell single-quoted here-strings for remote bash so $HOME is not expanded locally.
  - Each invocation is a fresh non-login shell; chain with && in one command.
"""
from __future__ import annotations

import argparse
import io
import os
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

import paramiko  # noqa: E402


def connect(
    host: str,
    user: str,
    password: str | None = None,
    key_path: str | None = None,
    timeout: int = 20,
) -> paramiko.SSHClient:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    kwargs: dict = {
        "hostname": host,
        "username": user,
        "timeout": timeout,
        "allow_agent": False,
        "look_for_keys": False,
    }
    if key_path:
        kwargs["key_filename"] = os.path.expanduser(key_path)
        kwargs["look_for_keys"] = True
    elif password is not None:
        kwargs["password"] = password
    else:
        raise SystemExit("Need password or --key")
    client.connect(**kwargs)
    return client


def run_one(client: paramiko.SSHClient, cmd: str, timeout: int = 120) -> int:
    # Collapse display of very long scripts
    preview = cmd if len(cmd) < 500 else cmd[:500] + f"\n… [{len(cmd)} chars]"
    print(f"\n$ {preview}")
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout, get_pty=False)
    out = stdout.read().decode(errors="replace")
    err = stderr.read().decode(errors="replace")
    exit_status = stdout.channel.recv_exit_status()
    if out:
        print(out.rstrip())
    if err.strip():
        print("STDERR:", err.rstrip())
    print(f"[exit={exit_status}]")
    return exit_status


def parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Non-interactive SSH via paramiko")
    p.add_argument("host")
    p.add_argument("user")
    p.add_argument(
        "password_or_flag",
        help="password, or --key / --env-password",
    )
    p.add_argument("rest", nargs=argparse.REMAINDER, help="command or --put/--get/--file args")
    p.add_argument("--timeout", type=int, default=120, help="command timeout seconds")
    # Pre-parse timeout from anywhere
    # Manual parse because password may look like a flag-free string
    return p.parse_args(argv)


def main() -> None:
    if len(sys.argv) < 5:
        print(__doc__)
        sys.exit(1)

    # Flexible parse: support --timeout anywhere after script name
    raw = sys.argv[1:]
    timeout = 120
    if "--timeout" in raw:
        i = raw.index("--timeout")
        timeout = int(raw[i + 1])
        del raw[i : i + 2]

    host, user = raw[0], raw[1]
    third = raw[2]
    rest = raw[3:]

    password: str | None = None
    key_path: str | None = None

    if third == "--key":
        key_path = rest[0]
        rest = rest[1:]
    elif third == "--env-password":
        password = os.environ.get("DEPLOY_SSH_PASSWORD") or os.environ.get(
            "APP_SERVER_SSH_PASSWORD"
        )
        if not password:
            raise SystemExit("DEPLOY_SSH_PASSWORD / APP_SERVER_SSH_PASSWORD not set")
    else:
        password = third

    if not rest:
        print(__doc__)
        sys.exit(1)

    mode = rest[0]
    client = connect(host, user, password=password, key_path=key_path)

    try:
        if mode == "--file":
            path = rest[1]
            with open(path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#"):
                        continue
                    code = run_one(client, line, timeout=timeout)
                    if code != 0:
                        sys.exit(code)
        elif mode == "--put":
            local, remote = rest[1], rest[2]
            sftp = client.open_sftp()
            try:
                sftp.put(local, remote)
            finally:
                sftp.close()
            print(f"uploaded {local} -> {host}:{remote}")
        elif mode == "--get":
            remote, local = rest[1], rest[2]
            sftp = client.open_sftp()
            try:
                sftp.get(remote, local)
            finally:
                sftp.close()
            print(f"downloaded {host}:{remote} -> {local}")
        else:
            # Entire remainder is the remote command (may contain spaces if one argv)
            cmd = " ".join(rest) if len(rest) > 1 else mode
            # When password_or_flag was password, rest[0] is full command if passed as one arg
            if len(rest) == 1:
                cmd = rest[0]
            else:
                # e.g. accidental split — rejoin
                cmd = " ".join(rest)
            code = run_one(client, cmd, timeout=timeout)
            sys.exit(code)
    finally:
        client.close()


if __name__ == "__main__":
    main()
