# Verifying in Roblox Studio

This project is developed in a cloud session, but the actual game can only be
exercised inside Roblox Studio, which runs on your own PC. This guide sets up
two ways to verify a build against real Studio:

- **A — Studio MCP (interactive):** an AI agent drives an open Studio session
  (run Luau, start play mode, read the console). Best when you've *teleported*
  this session onto your machine (`claude --teleport`).
- **B — `run-in-roblox` (headless):** one terminal command builds the place,
  launches Studio, runs a test script, prints the result, and exits. Best for a
  quick pass/fail with a copy-paste-able log.

Both run the same test scripts in [`tests/`](../tests).

---

## Prerequisites

You need Node and pnpm (already used for `pnpm build`) plus two Roblox tools.

### 1. Toolchain: Rojo + run-in-roblox

This repo pins both tools in [`rokit.toml`](../rokit.toml), so with
[Rokit](https://github.com/rojo-rbx/rokit) installed you only need, from the
repo root:

```powershell
rokit self-install   # once per machine — creates ~/.rokit/bin and puts it on PATH
rokit install        # installs the versions pinned in rokit.toml
```

`rokit self-install` is easy to miss: installing Rokit itself (via winget,
Homebrew, etc.) does *not* create the directory the tool shims live in, so
without it `rokit install` reports success and `rojo` still isn't runnable. It
changes PATH, so **open a new terminal afterwards**. Verify:

```powershell
rojo --version
run-in-roblox --version
```

To bump a pinned version, `rokit add rojo-rbx/rojo --force` rewrites
`rokit.toml` to the current latest — commit the change so everyone moves
together.

> Alternatives if you don't want Rokit: `cargo install rojo` and
> `cargo install run-in-roblox` (needs Rust), or grab prebuilt binaries from
> each project's GitHub Releases and put them on your `PATH`.

### 2. Roblox Studio MCP server (only needed for path A)

Download the official server and run its installer:

- Windows: [`rbx-studio-mcp.exe`](https://github.com/Roblox/studio-rust-mcp-server/releases/latest/download/rbx-studio-mcp.exe)
- macOS: [`macOS-rbx-studio-mcp.zip`](https://github.com/Roblox/studio-rust-mcp-server/releases/latest/download/macOS-rbx-studio-mcp.zip)

Running it installs a **Studio plugin** (check the Plugins tab — its icon
toggles the MCP connection on/off). Keep the downloaded binary somewhere
stable, e.g. `C:\Tools\rbx-studio-mcp.exe`.

Register it with Claude Code, either way:

```powershell
# One-off command (writes the project-scoped .mcp.json for you)
claude mcp add Roblox_Studio -- "C:\Tools\rbx-studio-mcp.exe" --stdio
```

...or copy the template and edit the path:

```powershell
copy .mcp.json.example .mcp.json
# then edit .mcp.json so "command" points at your rbx-studio-mcp binary
```

`.mcp.json` is git-ignored on purpose — the binary path is specific to your
machine, and committing it would make cloud sessions try (and fail) to launch a
Windows binary. `.mcp.json.example` is the shared template.

The MCP exposes: `run_code`, `run_script_in_play_mode`, `start_stop_play`,
`get_console_output`, `get_studio_mode`, `insert_model`.

---

## Path A — interactive (Studio MCP)

1. Build and open the place:
   ```powershell
   pnpm build:place        # compiles TS, writes game.rbxlx
   ```
   Open `game.rbxlx` in Studio (or run `pnpm serve` and sync with the Rojo
   Studio plugin for live updates).
2. Enable the Studio MCP plugin (Plugins tab).
3. In your teleported Claude Code session, the agent can now:
   - `run_code` with the contents of `tests/progression.spec.luau` to check the
     progression math, and
   - `run_script_in_play_mode` with `tests/smoke.play.luau` to boot the server
     and confirm the world spawns.
   - Read `get_console_output` to see the `[TEST] PASS/FAIL … DONE` lines.

## Path B — headless (run-in-roblox)

```powershell
pnpm build:place    # compile + build game.rbxlx
pnpm test:logic     # progression math assertions
pnpm test:spawn     # EnemyService spawns 3 dummies with full-health labels
```

Each command opens Studio, runs the script, and closes. Paste the `[TEST]`
output back into the cloud session and I'll turn any failure into a fix.

Two things will make these hang or fail, and neither error message says so:

- **Studio must be signed in.** A signed-out Studio opens its login dialog
  instead of the place, so the script never runs and run-in-roblox dies with
  `Timeout reached while waiting for Roblox Studio to come online`. Sign in once,
  manually.
- **Close Studio first.** run-in-roblox launches its own instance; an already-open
  one conflicts with it.

`run-in-roblox` runs scripts at **plugin-level security, in edit mode** — server
`Script`s never execute. Anything that needs a booted server (like
`smoke.play.luau`) belongs on Path A; headless tests must drive the services
themselves, the way `spawn.spec.luau` does.

---

## What the tests cover

| Script | Checks | Runs via |
| --- | --- | --- |
| `tests/progression.spec.luau` | `xpToNext` / `maxHealthForLevel` curves, core tuning constants, and the level-up loop logic | Path A or B |
| `tests/spawn.spec.luau` | `EnemyService.start()` spawns 3 training dummies with the `IsEnemy` attribute and a full-health label | Path A or B |
| `tests/smoke.play.luau` | The server actually boots: `main.server` wires the services and builds the world unprompted | Path A only |

`spawn.spec.luau` and `smoke.play.luau` overlap on purpose. The first drives
`EnemyService` directly so it can run headless; only the second proves the boot
path wires it up at all, which is why it's worth keeping despite needing Studio.

These cover logic and boot health. The *feel* of the game — combat timing,
HUD readability, whether leveling is satisfying — still needs a human playtest.
