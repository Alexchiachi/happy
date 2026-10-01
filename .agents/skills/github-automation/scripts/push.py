#!/usr/bin/env python3
"""
github-automation: auto-build, auto-commit, and auto-push to GitHub.
Supports both SSH and HTTPS/Token credentials, handles project-specific pre-commit hooks,
and provides seamless, non-interactive pushing.
"""
import argparse
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path


def run_cmd(cmd, cwd=None, capture=True, check=False, env=None):
    merged_env = os.environ.copy()
    if env:
        merged_env.update(env)
    # Prevent interactive git credential prompts hanging in daemon mode
    merged_env["GIT_TERMINAL_PROMPT"] = "0"
    merged_env["GIT_ASKPASS"] = "echo"

    res = subprocess.run(
        cmd,
        cwd=cwd,
        capture_output=capture,
        text=True,
        env=merged_env,
    )
    if check and res.returncode != 0:
        err = res.stderr.strip() if res.stderr else res.stdout.strip()
        raise RuntimeError(f"Command failed ({' '.join(cmd)}): {err}")
    return res


def get_repo_root(target_dir=None):
    target = target_dir or os.getcwd()
    res = run_cmd(["git", "-C", target, "rev-parse", "--show-toplevel"])
    if res.returncode == 0:
        return Path(res.stdout.strip())

    # Fallback to EPUBQA_HOME if set
    fallback = os.environ.get("EPUBQA_HOME")
    if fallback and os.path.exists(fallback):
        res2 = run_cmd(["git", "-C", fallback, "rev-parse", "--show-toplevel"])
        if res2.returncode == 0:
            return Path(res2.stdout.strip())

    print(f"❌ '{target}' 並非 Git 倉庫！請在 Git 倉庫內執行或指定 -C /path/to/repo。", file=sys.stderr)
    sys.exit(1)


def run_project_build_hooks(root: Path):
    """執行專案特定之自動建置與資產更新腳本（若存在）"""
    bump_assets = root / "tools" / "bump_assets.py"
    build_zhcn = root / "tools" / "build_zhcn.py"

    if bump_assets.exists():
        print("⚡ [前置步驟] 執行 bump_assets.py 更新資產快取雜湊...")
        run_cmd(["python3", str(bump_assets)], cwd=root)

    if build_zhcn.exists():
        print("⚡ [前置步驟] 執行 build_zhcn.py 同步簡體版...")
        uv_path = shutil.which("uv") or "/Users/chienchiachi/.local/bin/uv"
        if Path(uv_path).exists():
            run_cmd([str(uv_path), "run", "--with", "opencc-python-reimplemented", "python3", str(build_zhcn)], cwd=root)
        else:
            run_cmd(["python3", str(build_zhcn)], cwd=root)

        if bump_assets.exists():
            run_cmd(["python3", str(bump_assets)], cwd=root)


def get_current_branch(root: Path) -> str:
    res = run_cmd(["git", "branch", "--show-current"], cwd=root)
    branch = res.stdout.strip()
    return branch or "main"


def check_ssh_authenticated() -> bool:
    """測試 SSH 是否能免密連線至 GitHub"""
    res = run_cmd(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=5", "-T", "git@github.com"])
    combined = (res.stdout + res.stderr).lower()
    return "successfully authenticated" in combined


def get_ssh_pub_key() -> str:
    pub_path = Path.home() / ".ssh" / "id_ed25519.pub"
    if pub_path.exists():
        return pub_path.read_text().strip()
    return ""


def main():
    parser = argparse.ArgumentParser(description="一鍵自動化 Commit 並推送至 GitHub")
    parser.add_argument("-C", "--directory", help="目標 Git 倉庫目錄路徑")
    parser.add_argument("-m", "--message", help="提交訊息（若未提供將自動產生）")
    parser.add_argument("-b", "--branch", help="推送分支（預設當前分支）")
    parser.add_argument("--skip-build", action="store_true", help="跳過前置專案自動建置腳本")
    args = parser.parse_args()

    root = get_repo_root(args.directory)
    branch = args.branch or get_current_branch(root)

    print(f"📁 倉庫根目錄: {root}")
    print(f"🌿 目標分支: {branch}")

    # 1. 執行前置自動建置
    if not args.skip_build:
        run_project_build_hooks(root)

    # 2. 檢查是否有未提交變更
    res_status = run_cmd(["git", "status", "--porcelain"], cwd=root)
    status_output = res_status.stdout.strip()

    if status_output:
        print("📦 發現本機變更，正在加入暫存區 (git add .)...")
        run_cmd(["git", "add", "."], cwd=root, check=True)

        commit_msg = args.message
        if not commit_msg:
            changed_files = [line[3:].strip() for line in status_output.splitlines() if len(line) > 3]
            summary = ", ".join(changed_files[:3])
            if len(changed_files) > 3:
                summary += f" 等 {len(changed_files)} 個檔案"
            commit_msg = f"自動更新: {summary}"

        print(f"✍️ 正在提交: {commit_msg}")
        run_cmd(["git", "commit", "-m", commit_msg], cwd=root, check=True)
    else:
        print("✨ 工作區無未提交變更。")

    # 3. 檢查是否需要推送到遠端
    res_ahead = run_cmd(["git", "log", f"origin/{branch}..HEAD", "--oneline"], cwd=root)
    ahead_commits = res_ahead.stdout.strip()
    if not ahead_commits and not status_output:
        res_remote = run_cmd(["git", "remote"], cwd=root)
        if "origin" in res_remote.stdout:
            print("✅ 遠端與本機已完全同步，無需推送。")
            return 0

    # 4. 取得 remote origin 網址
    res_url = run_cmd(["git", "remote", "get-url", "origin"], cwd=root)
    remote_url = res_url.stdout.strip() if res_url.returncode == 0 else ""
    print(f"🔗 遠端倉庫 URL: {remote_url}")

    # 5. 檢測認證模式與推送
    print("🚀 準備推送到遠端 GitHub...")
    ssh_ready = check_ssh_authenticated()

    # 如果 SSH 已經通，且 remote_url 是 HTTPS，自動轉換為 SSH 格式以免密推送
    if ssh_ready and remote_url.startswith("https://github.com/"):
        match = re.match(r"https://github\.com/([^/]+)/(.+?)(?:\.git)?$", remote_url)
        if match:
            owner, repo_name = match.groups()
            ssh_url = f"git@github.com:{owner}/{repo_name}.git"
            print(f"🔄 偵測到 SSH 免密金鑰已啟用，自動將 remote origin 切換為 SSH: {ssh_url}")
            run_cmd(["git", "remote", "set-url", "origin", ssh_url], cwd=root)
            remote_url = ssh_url

    # 執行 git push
    push_res = run_cmd(["git", "push", "origin", branch], cwd=root)

    if push_res.returncode == 0:
        print(f"🎉 成功推送到 GitHub ({branch} 分支)！")
        last_commit = run_cmd(["git", "rev-parse", "--short", "HEAD"], cwd=root).stdout.strip()
        print(f"🔖 最新 Commit: {last_commit}")
        print("🌐 GitHub Actions CI/CD 將自動觸發並部署上線。")
        return 0

    # 若推送失敗，詳細診斷認證問題
    print("⚠️ 推送失敗，詳細原因如下：", file=sys.stderr)
    print(push_res.stderr.strip() or push_res.stdout.strip(), file=sys.stderr)

    if not ssh_ready:
        pub_key = get_ssh_pub_key()
        print("\n" + "=" * 65, file=sys.stderr)
        print("🔑【一鍵免密授權設定引導】", file=sys.stderr)
        print("系統已為您生成專用 SSH 金鑰，只需將以下公鑰加到 GitHub 帳號（僅需一次）：", file=sys.stderr)
        print("👉 前往新增：https://github.com/settings/ssh/new", file=sys.stderr)
        print(f"\n公鑰內容：\n{pub_key}\n", file=sys.stderr)
        print("加好公鑰後，再度執行此技能即可永久自動推播！", file=sys.stderr)
        print("=" * 65 + "\n", file=sys.stderr)

    sys.exit(1)


if __name__ == "__main__":
    main()
