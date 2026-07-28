#!/usr/bin/env python3
"""
非交互式 SSH 命令执行器，专为 Windows/Git Bash 环境设计。

普通 `ssh user@host "cmd"` 在这个环境下会卡在密码交互输入，用不了；
这个脚本用 paramiko 直接建连、传密码或私钥、跑命令，一步到位。

用法（密码认证）：
    python ssh_run.py <host> <user> <password> "<command>"
    python ssh_run.py <host> <user> <password> --file commands.txt   # 依次执行文件里每一行命令
    python ssh_run.py <host> <user> <password> --put <local> <remote>  # 上传文件（SFTP）
    python ssh_run.py <host> <user> <password> --get <remote> <local>  # 下载文件（SFTP）

用法（私钥认证，第三个参数写 --key 后跟私钥文件路径）：
    python ssh_run.py <host> <user> --key <keyfile> "<command>"
    python ssh_run.py <host> <user> --key <keyfile> --file commands.txt
    python ssh_run.py <host> <user> --key <keyfile> --put <local> <remote>
    python ssh_run.py <host> <user> --key <keyfile> --get <remote> <local>

每条命令独立开一个 exec_command（不是交互式 shell），所以像 `cd xxx && cmd1 && cmd2`
这种要在同一条命令里写完，不能指望 cd 在下一次调用里生效。
"""
import sys
import io

# Windows 控制台默认 gbk 编码，服务器输出常有 emoji/特殊符号，不 reconfigure 会直接崩
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

import paramiko


def connect(host: str, user: str, password: str = None, key_path: str = None) -> paramiko.SSHClient:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    if key_path:
        pkey = paramiko.Ed25519Key.from_private_key_file(key_path)
        client.connect(host, username=user, pkey=pkey, timeout=20)
    else:
        client.connect(host, username=user, password=password, timeout=20)
    return client


def run_one(client: paramiko.SSHClient, cmd: str, timeout: int = 90) -> int:
    print(f"\n$ {cmd}")
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode(errors="replace")
    err = stderr.read().decode(errors="replace")
    exit_status = stdout.channel.recv_exit_status()
    if out:
        print(out.rstrip())
    if err.strip():
        print("STDERR:", err.rstrip())
    print(f"[exit={exit_status}]")
    return exit_status


def main() -> None:
    if len(sys.argv) < 5:
        print(__doc__)
        sys.exit(1)

    host, user, arg3, mode = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
    if arg3 == "--key":
        key_path = mode
        mode = sys.argv[5]
        shift = 1
        client = connect(host, user, key_path=key_path)
    else:
        password = arg3
        shift = 0
        client = connect(host, user, password=password)

    try:
        if mode == "--file":
            path = sys.argv[5 + shift]
            with open(path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#"):
                        continue
                    run_one(client, line)
        elif mode == "--put":
            local, remote = sys.argv[5 + shift], sys.argv[6 + shift]
            sftp = client.open_sftp()
            sftp.put(local, remote)
            sftp.close()
            print(f"uploaded {local} -> {host}:{remote}")
        elif mode == "--get":
            remote, local = sys.argv[5 + shift], sys.argv[6 + shift]
            sftp = client.open_sftp()
            sftp.get(remote, local)
            sftp.close()
            print(f"downloaded {host}:{remote} -> {local}")
        else:
            # mode 本身就是要执行的命令
            run_one(client, mode)
    finally:
        client.close()


if __name__ == "__main__":
    main()
