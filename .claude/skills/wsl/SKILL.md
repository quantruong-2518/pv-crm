---
name: wsl
description: How to invoke pnpm · node · git · the dev server for pv-crm. The repo lives in WSL while Claude Code runs on Windows, so calling directly fails SILENTLY — commits that never happen, empty shell variables, exit 15 with no output. Read before ANY pnpm/git/dev-server command. Also read when typecheck is green but the browser is red, when `git log` is unchanged although the command finished, or when port 5173 returns 000.
---

# Running the pv-crm toolchain

The repo is at `/home/stevetruong/work/pebble-vina/pv-crm` **inside WSL**. Claude
Code runs on Windows and sees it through the UNC path `\\wsl.localhost\...`.

Reading and writing files over UNC is fine. **Running commands is not**: calling
`pnpm`/`npm` directly through the Bash tool spawns `cmd.exe`, which does not
understand UNC — it prints "UNC paths are not supported. Defaulting to Windows
directory" and then runs in the wrong place.

## The canonical one-liner

```bash
wsl.exe -d Ubuntu-20.04 bash -lc '. ~/.nvm/nvm.sh; nvm use 22 >/dev/null 2>&1; cd ~/work/pebble-vina/pv-crm; pnpm check'
```

Three details that must not change:

- **Single quotes** around the command string.
- **`. ~/.nvm/nvm.sh`**, not `"$NVM_DIR/nvm.sh"` — that variable is swallowed on
  the way through `wsl.exe` and becomes `/nvm.sh: No such file`.
- `cd /c` on the Git Bash side **before** calling `wsl.exe`, to avoid the UNC warning.

## The biggest trap · `$(...)` and `$?` are eaten before they reach WSL

Single quotes do NOT protect command substitution. Git Bash on the Windows side
runs `$(...)` **in itself** — working directory `/c`, outside the repo — and only
then splices the result into the string sent to `wsl.exe`.

Real symptom: `TREE=$(git write-tree)` became `TREE=fatal: not a git repository`,
`git commit-tree` died silently, `git log` was unchanged — **while every `echo`
line still printed normally**. `$?` behaves the same way: it is Git Bash's exit
code, not the exit code of the command inside WSL.

**Rule:** if a command contains `$(...)`, `$?`, or shell variables, **do not send
it as a one-liner**. Write a `.sh` file with the Write tool (over UNC), then:

```bash
wsl.exe -d Ubuntu-20.04 bash -lc 'bash ~/script.sh 2>&1'
```

One-liners are only safe for flat commands: `pnpm check`, `git status`, `git diff`.

## Dev server · `run_in_background`, never `nohup`

`nohup pnpm dev &` inside a one-shot `wsl.exe` command **is killed the moment that
command returns**. The log still prints "ready in 137 ms" but `curl` afterwards
returns 000.

Run it through the Bash tool with `run_in_background: true` and the server
survives across turns. Port 5173 is often taken by a parallel session and Vite
silently moves to 5174 — **read the log for the real port, never assume it**.

## Kill by PORT, never by pattern

`pkill -f "dist/apps/api/src/main.js"` sent through `wsl.exe bash -lc '...'` also
matches the command line of the wrapping bash itself (the pattern string is inside
it), so **it kills itself** and every later command in the same chain silently
never runs. Symptom: exit 15 with empty output.

```bash
fuser -k 5173/tcp    # web
fuser -k 3000/tcp    # api
```

No command substitution involved, so this is also safe from the `$(...)` trap above.

## Green compiler + red browser = Vite cache, not a bug in the code

Symptom: `The requested module '/@fs/.../packages/contracts/src/index.ts?t=…' does
not provide an export named 'X'` while `pnpm typecheck:web` **exits 0** and the
file genuinely has that export.

Cause: the file was written from the Windows side into WSL, so **inotify never
fired** and Vite kept its old transform. Most common on barrel files
(`export * from`) — an already-loaded module still remembers the old export list.

Diagnose without guessing — ask the running server directly:

```bash
curl -s "http://127.0.0.1:5173/@fs/<absolute-path>/index.ts" | grep <export-name>
```

Empty here while the file on disk has it = the server is holding a stale copy.
`touch` does **not** help (already tried). Restart: `fuser -k 5173/tcp`, then
`pnpm dev` again with `run_in_background`.

**Do not go hunting for a bug in the code when `typecheck` is already green.**

## Long heredocs — use the Write tool instead

`cat > file <<'EOF'` with long content (Vietnamese markdown, backticks, tables)
dies at the Git Bash layer with `unexpected EOF while looking for matching quote`,
**and the file is never created**. Heredocs are only reliable for short source files.

To get long content into WSL (a commit message, say): Write it to
`\\wsl.localhost\Ubuntu-20.04\tmp\...` then `git commit -F /tmp/...`.

## Git must run INSIDE WSL

Two reasons, both of which corrupt commits silently:

1. **Windows sets `core.autocrlf = true`**, WSL does not. Committing from Git Bash
   over UNC pushes CRLF into the index of an all-LF repo.
2. **The `pre-commit` hook (husky → lint-staged) needs nvm.** Without sourcing nvm
   the hook dies with a Windows-shaped `'lint-staged' is not recognized`.

The git identity only exists on the WSL side, not on Windows.

## Pushing to GitHub

`origin` is HTTPS and **will hang** — `~/.gitconfig` sets `credential.helper` to
the AWS CodeCommit helper, useless against GitHub, and running through `wsl.exe`
there is no terminal to prompt for a password. The default SSH identity is wrong
too: `ssh -T git@github.com` authenticates as `Nexora55`, an account with **no
push rights** on this repo.

`~/.ssh/config` inside WSL already has a host alias — use it, do not edit the remote:

```bash
git push git@github-quantruong2518:quantruong-2518/pv-crm.git develop
```

If the alias is missing, name the key explicitly:

```bash
GIT_SSH_COMMAND='ssh -i ~/.ssh/id_quantruong2518 -o IdentitiesOnly=yes' \
  git push git@github.com:quantruong-2518/pv-crm.git develop:develop
```

Pushing by URL does not update `origin/develop`, so also run
`git update-ref refs/remotes/origin/develop develop` to stop `git status` from
reporting the wrong ahead-count.

Building and verifying a commit: `/preflight`.
