import argparse
import errno
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import uuid
import base64


HOST = "kmserver01"
SSH_OPTIONS = [
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=8",
    "-o", "StrictHostKeyChecking=yes",
    "-o", "UpdateHostKeys=no",
]
FINDER_COPY = """
on run arguments
  set downloadsPath to item 1 of arguments
  set stagingPath to item 2 of arguments
  set explicitPath to item 3 of arguments
  tell application "Finder"
    if explicitPath is not "" then
      set selectedFile to POSIX file explicitPath as alias
    else
      set sourceFolder to POSIX file downloadsPath as alias
      set candidates to every file of sourceFolder whose name begins with "EyPc-" and name ends with ".upxs"
      if (count of candidates) is 0 then error "No matching EyPc package"
      set selectedFile to item 1 of candidates
      repeat with candidate in candidates
        if modification date of candidate > modification date of selectedFile then
          set selectedFile to contents of candidate
        else if modification date of candidate = modification date of selectedFile then
          if name of candidate > name of selectedFile then set selectedFile to contents of candidate
        end if
      end repeat
    end if
    if class of selectedFile is alias file then error "Alias source not allowed"
    set originalPath to POSIX path of (selectedFile as alias)
    duplicate selectedFile to (POSIX file stagingPath as alias)
    return originalPath
  end tell
end run
"""


def run_command(arguments, *, timeout, input_text=None, label):
    try:
        result = subprocess.run(
            arguments, input=input_text, text=True, encoding="utf-8", errors="replace",
            capture_output=True, timeout=timeout
        )
    except subprocess.TimeoutExpired as error:
        raise RuntimeError(f"{label}超时") from error
    except OSError as error:
        raise RuntimeError(f"{label}无法启动：{error.__class__.__name__}") from error
    if result.returncode:
        raise RuntimeError(f"{label}失败，退出码 {result.returncode}")
    return result.stdout.strip()


def stage_package(downloads, explicit_source, staging):
    source = explicit_source
    try:
        if source is None:
            with os.scandir(downloads) as entries:
                candidates = [
                    Path(entry.path) for entry in entries
                    if entry.name.startswith("EyPc-") and entry.name.endswith(".upxs")
                    and entry.is_file(follow_symlinks=False)
                ]
            if not candidates:
                raise RuntimeError(f"{downloads} 中没有 EyPc-*.upxs")
            source = max(candidates, key=lambda item: (item.stat().st_mtime_ns, item.name))
        if source.is_symlink() or not source.is_file():
            raise RuntimeError("安装包必须是普通文件")
        before = source.stat()
        shutil.copyfile(source, staging / source.name)
        after = source.stat()
        if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
            raise RuntimeError("复制期间安装包发生变化，请打包完成后重试")
        return source, staging / source.name
    except OSError as error:
        if sys.platform != "darwin" or error.errno not in (errno.EACCES, errno.EPERM):
            raise
        print("Downloads 读取受限，改由 Finder 定向复制安装包。", file=sys.stderr)
        original = run_command(
            ["osascript", "-", str(downloads), str(staging), str(source or "")],
            timeout=45, input_text=FINDER_COPY, label="Finder 安装包复制",
        )
        source = Path(original)
        staged = staging / source.name
        if not staged.is_file():
            raise RuntimeError("Finder 未生成可读安装包；请允许执行工具访问 Downloads 后重试")
        return source, staged


def ps_literal(value):
    return "'" + value.replace("'", "''") + "'"


def sha256_file(file_path):
    digest = hashlib.sha256()
    with file_path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def remote(script):
    prefix = (
        "$ErrorActionPreference='Stop';"
        "[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false);"
        "if($env:OS -ne 'Windows_NT'){throw 'Windows target required'};"
    )
    encoded = base64.b64encode((prefix + script).encode("utf-16le")).decode("ascii")
    output = run_command(
        ["ssh", *SSH_OPTIONS, HOST,
         f"powershell.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand {encoded}"],
        timeout=60, label="Windows SSH 操作",
    )
    try:
        return json.loads(output)
    except json.JSONDecodeError as error:
        raise RuntimeError("Windows 未返回有效的文件核验结果") from error


def main():
    parser = argparse.ArgumentParser(
        description="将 Downloads 中按修改时间最新的 EyPc-*.upxs 传到 kmserver01 的 Windows 桌面。"
    )
    parser.add_argument("--source", type=Path, help="指定本次包；省略则自动取最新包")
    parser.add_argument("--dry-run", action="store_true", help="只核对来源和目标，不上传或替换")
    arguments = parser.parse_args()
    explicit = arguments.source.expanduser().absolute() if arguments.source else None
    if explicit and not (explicit.name.startswith("EyPc-") and explicit.suffix == ".upxs"):
        raise RuntimeError("来源名称必须匹配 EyPc-*.upxs")
    with tempfile.TemporaryDirectory(prefix="eypc-upxs-") as temporary:
        source, staged = stage_package(Path.home() / "Downloads", explicit, Path(temporary))
        digest = sha256_file(staged)
        size = staged.stat().st_size
        if size == 0:
            raise RuntimeError("不能传送空安装包")
        probe = remote(
            "$desktop=[Environment]::GetFolderPath('DesktopDirectory');"
            "if(-not $desktop -or -not (Test-Path -LiteralPath $desktop -PathType Container))"
            "{throw 'Desktop unavailable'};"
            f"$target=Join-Path $desktop {ps_literal(staged.name)};"
            "if(Test-Path -LiteralPath $target -PathType Container){throw 'Target is a directory'};"
            "$exists=Test-Path -LiteralPath $target -PathType Leaf;"
            "$hash=if($exists){(Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()}else{''};"
            "@{target=$target;exists=$exists;sha256=$hash}|ConvertTo-Json -Compress"
        )
        target = probe["target"]
        print(f"来源：{source}\n目标：{HOST}:{target}\n字节：{size}\nSHA-256：{digest}")
        if arguments.dry_run:
            print("预检完成，未上传或替换。")
            return
        if probe["sha256"] == digest:
            print("桌面同名文件摘要已一致，无需重复传送。")
            return
        remote_temporary = target + "." + uuid.uuid4().hex + ".uploading"
        try:
            run_command(
                ["scp", "-q", *SSH_OPTIONS, str(staged),
                 f"{HOST}:{remote_temporary.replace(chr(92), '/')}"],
                timeout=180, label="安装包上传",
            )
            result = remote(
                f"$temp={ps_literal(remote_temporary)};$target={ps_literal(target)};"
                "try{"
                "$uploaded=(Get-FileHash -LiteralPath $temp -Algorithm SHA256).Hash.ToLowerInvariant();"
                f"if($uploaded -ne {ps_literal(digest)}){{throw 'Uploaded hash mismatch'}};"
                "$exists=Test-Path -LiteralPath $target -PathType Leaf;"
                "$current=if($exists){(Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()}else{''};"
                f"if($current -ne {ps_literal(probe['sha256'])}){{throw 'Target changed during upload'}};"
                "if($exists){[IO.File]::Replace($temp,$target,[System.Management.Automation.Language.NullString]::Value)}"
                "else{[IO.File]::Move($temp,$target)};"
                "$actual=(Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant();"
                f"if($actual -ne {ps_literal(digest)}){{throw 'Final hash mismatch'}};"
                "@{sha256=$actual;bytes=(Get-Item -LiteralPath $target).Length;replaced=$exists}|ConvertTo-Json -Compress"
                "}finally{if(Test-Path -LiteralPath $temp -PathType Leaf){Remove-Item -LiteralPath $temp -Force}}"
            )
            if result["sha256"] != digest or result["bytes"] != size:
                raise RuntimeError("Windows 最终文件核验不一致")
            print("已替换桌面同名文件，SHA-256 与字节数一致。" if result["replaced"]
                  else "已放到 Windows 桌面，SHA-256 与字节数一致。")
        except Exception:
            try:
                remote(
                    f"$temp={ps_literal(remote_temporary)};"
                    "if(Test-Path -LiteralPath $temp -PathType Leaf){Remove-Item -LiteralPath $temp -Force};"
                    "@{cleaned=$true}|ConvertTo-Json -Compress"
                )
            except Exception:
                print("临时上传文件清理未确认，下次操作前应核对。", file=sys.stderr)
            raise


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, KeyError) as error:
        print(f"传送失败：{error}", file=sys.stderr)
        sys.exit(1)
