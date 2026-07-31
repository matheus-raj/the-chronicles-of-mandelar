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

**Nothing to download.** Current Studio builds ship the MCP proxy themselves as
`StudioMCP.exe`, inside the active version folder under
`%LOCALAPPDATA%\Roblox\Versions\`. The older standalone
[`rbx-studio-mcp.exe`](https://github.com/Roblox/studio-rust-mcp-server) release
is no longer needed on Windows.

Because that path contains a version hash that changes on every Studio update,
use [`tools/studio-mcp.cmd`](../tools/studio-mcp.cmd), which resolves the newest
`StudioMCP.exe` at launch:

```powershell
copy .mcp.json.example .mcp.json
# then edit .mcp.json so the path points at this repo's tools\studio-mcp.cmd
```

> Roblox also writes its own launcher to `%LOCALAPPDATA%\Roblox\mcp.bat`. **Don't
> use it.** It hardcodes a single Studio version, and its fallback branch is a
> batch syntax error (`else` on its own line), so it breaks after a Studio
> update and spews parse errors on stderr meanwhile. `tools/studio-mcp.cmd`
> exists to avoid that.

`.mcp.json` is git-ignored on purpose — the path is specific to your machine, and
committing it would make cloud sessions try (and fail) to launch a Windows
binary. `.mcp.json.example` is the shared template.

macOS still needs the standalone server from the
[studio-rust-mcp-server releases](https://github.com/Roblox/studio-rust-mcp-server/releases/latest);
`tools/studio-mcp.cmd` is Windows-only.

After editing `.mcp.json`, **restart Claude Code** — MCP servers are loaded at
startup, so a new one won't appear mid-session.

Studio's half of the bridge is **not** a plugin you install: nothing lands in
`%LOCALAPPDATA%\Roblox\Plugins`, and the version folder ships only
`StudioMCP.exe`. It's built into Studio behind a setting. Open **File → Studio
Settings** and search for `MCP` (it has moved between Studio releases, so it may
sit under Beta Features). Until that's on, the proxy runs but bridges nothing.

The MCP is a *proxy*: it returns an empty tool list until Studio is running and
connected. **The client captures that list at handshake time**, so the usual
order — start the session, then open Studio — leaves you with a permanently
empty tool list and no error to explain it. Either connect Studio *before*
starting Claude Code, or run `/mcp` afterwards and reconnect `Roblox_Studio`,
which re-runs the handshake against a proxy that now has tools.

To check whether Studio really is attached, look for an established loopback
connection to the proxy's listener rather than guessing:

```powershell
Get-NetTCPConnection -OwningProcess (Get-Process StudioMCP).Id |
  Where-Object State -eq Established
```

Once connected, Studio exposes `execute_luau` (which takes a `datamodel_type` of
`Edit`, `Client`, or `Server`), `start_stop_play`, `get_studio_state`,
`get_console_output`, `list_roblox_studios`, and others. Confirm the live list
with `/mcp` rather than trusting this one — it comes from Studio and changes
between versions.

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
   - `execute_luau` with `datamodel_type: "Edit"` and the contents of
     `tests/progression.spec.luau` to check the progression math,
   - `start_stop_play` to boot the server, then `execute_luau` with
     `datamodel_type: "Server"` and `tests/smoke.play.luau` to confirm the world
     spawns, and
   - `get_console_output` to see the `[TEST] PASS/FAIL … DONE` lines — plus any
     boot errors, which is where a failing `smoke.play.luau` explains itself.

   `execute_luau` returns the value of the script's final expression, so a test
   that ends in `error()` reports a tool failure. Having the script accumulate
   its `[TEST]` lines and `return` them makes the result readable either way.

## Path B — headless (run-in-roblox)

```powershell
pnpm build:place    # compile + build game.rbxlx
pnpm test:logic     # progression math + config invariants
pnpm test:ai        # every enemy-brain state transition, deterministically
pnpm test:spawn     # enemies spawn on the ground, near their posts
```

Each command opens Studio, runs the script, and closes. Paste the `[TEST]`
output back into the cloud session and I'll turn any failure into a fix.

Two things will make these hang or fail, and neither error message says so:

- **Studio must be signed in.** A signed-out Studio opens its login dialog
  instead of the place, so the script never runs and run-in-roblox dies with
  `Timeout reached while waiting for Roblox Studio to come online`. Sign in once,
  manually.
- **Close Studio first.** run-in-roblox launches its own instance; an already-open
  one conflicts with it. Worse than a hang: a lingering Studio holding an older
  copy of the place can get killed mid-run and **save its stale DataModel over
  your freshly built `game.rbxlx`** — tests then fail against code you deleted,
  with no error pointing at the cause. If results make no sense, check the
  place file's timestamp and rebuild.

`run-in-roblox` runs scripts at **plugin-level security, in edit mode** — server
`Script`s never execute. Anything that needs a booted server (like
`smoke.play.luau`) belongs on Path A; headless tests must drive the services
themselves, the way `spawn.spec.luau` does.

---

## What the tests cover

| Script | Checks | Runs via |
| --- | --- | --- |
| `tests/progression.spec.luau` | `xpToNext` / `maxHealthForLevel` curves, tuning constants, and the config invariants (range orderings, spawn-pad safety, spawn points on the ground slab) | Path A or B |
| `tests/ai.spec.luau` | Every `EnemyBrain` state transition — wander, aggro, chase, attack cooldowns, leash, evade — deterministically, with injected RNG and no players | Path A or B |
| `tests/spawn.spec.luau` | `EnemyService.start()` spawns every configured enemy on the ground, within wander range of its post | Path A or B |
| `tests/smoke.play.luau` | The server boots and the game *plays*: world built, enemies behave (aggro → chase → hit), death costs unbanked XP, evade heals and goes home | Path A only |

`spawn.spec.luau` and `smoke.play.luau` overlap on purpose. The first drives
`EnemyService` directly so it can run headless; only the second proves the boot
path wires it up at all, which is why it's worth keeping despite needing Studio.

The behaviour half of `smoke.play.luau` **moves and kills the test player's
character** (teleports it into a ghoul's aggro range, later sets its health to
0) to exercise combat and the death penalty for real. It drives the live
services through the `TestApi` bindables in ServerStorage — `execute_luau`
runs in a separate Lua environment from game scripts, so requiring a module
from a test yields a fresh empty copy; Instances are the only bridge (see
`src/server/testApi.ts`).

These cover logic, boot health, and behaviour. The *feel* of the game — combat
timing, HUD readability, whether leveling is satisfying — still needs a human
playtest.
