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

You need Node (already used for `npm run build`) plus two Roblox tools.

### 1. Toolchain: Rojo + run-in-roblox

The cleanest installer is [Rokit](https://github.com/rojo-rbx/rokit). After
installing Rokit, from the repo root:

```powershell
rokit init            # only if a rokit.toml doesn't exist yet
rokit add rojo-rbx/rojo
rokit add rojo-rbx/run-in-roblox
rokit install
```

`rokit add` pins the current latest versions for you (no guessing). Verify:

```powershell
rojo --version
run-in-roblox --version
```

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
   npm run build:place        # compiles TS, writes game.rbxlx
   ```
   Open `game.rbxlx` in Studio (or run `npm run serve` and sync with the Rojo
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
npm run build:place    # compile + build game.rbxlx
npm run test:logic     # progression math assertions
npm run test:smoke     # boots the server, checks the 3 dummies spawn
```

Each command opens Studio, runs the script, and closes. Paste the `[TEST]`
output back into the cloud session and I'll turn any failure into a fix.

---

## What the tests cover

| Script | Checks |
| --- | --- |
| `tests/progression.spec.luau` | `xpToNext` / `maxHealthForLevel` curves, core tuning constants, and the level-up loop logic |
| `tests/smoke.play.luau` | Server boots and `EnemyService` spawns 3 training dummies with the `IsEnemy` attribute and a full-health label |

These cover logic and boot health. The *feel* of the game — combat timing,
HUD readability, whether leveling is satisfying — still needs a human playtest.
