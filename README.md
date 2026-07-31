# The Chronicles of Mandelar

An MMORPG set on a solarpunk Earth — a planet that survived its apocalypse and
came out the other side greener than it went in.

The collapse already happened. What grew back wasn't a wasteland: humanity
rebuilt *with* the planet instead of on top of it. Cities are grown as much as
they're built, power comes off the sun and the wind and the tide, and technology
serves the living world rather than paving it. Earth didn't just endure the end
of the old world — it evolved past it.

Now something wants to take it.

**Ghouls** claw their way up out of what the old world left behind — the
apocalypse's unfinished business, still hungry.

**Robots** march in cold and patient, machinery that outlasted its makers and
kept its orders long after there was anyone left to give them.

They want the world. You and every other player online are what stands between
them and it.

## Built with

A Roblox game written in **TypeScript** using [roblox-ts](https://roblox-ts.com/),
which compiles TypeScript into Luau. Code is synced into Roblox Studio with
[Rojo](https://rojo.space/).

## Prerequisites

Install these once on your machine:

| Tool | Purpose | Install |
| ---- | ------- | ------- |
| [Node.js](https://nodejs.org/) 22.13+ | Runs the roblox-ts compiler; pnpm 11 requires it | Download installer |
| [pnpm](https://pnpm.io/) | Package manager for this repo | `corepack enable pnpm` (may need an admin shell) or `npm install -g pnpm` |
| [Rojo](https://rojo.space/docs/v7/getting-started/installation/) | Syncs compiled code into Studio | `cargo install rojo` or the [Aftman/Rokit](https://github.com/rojo-rbx/rokit) toolchain manager |
| [Roblox Studio](https://create.roblox.com/) | The editor/runtime for the game | Download from Roblox |
| **Rojo Studio plugin** | Connects Studio to the local Rojo server | Install from the Studio plugin marketplace or `rojo plugin install` |

The **roblox-ts** and **Rojo** VS Code extensions are recommended (see
`.vscode/extensions.json`).

## Getting started

```bash
# 1. Install dependencies
pnpm install

# 2. Compile TypeScript -> Luau, and re-compile on every save
pnpm watch

# 3. In a second terminal, start the Rojo server
pnpm serve
```

Then, in Roblox Studio: open a new baseplate, open the **Rojo** plugin, and
click **Connect**. Your compiled code streams into the place live. Press
**Play** and check the Output window — you should see the greeting printed by
`src/server/main.server.ts`.

## Gameplay (current vertical slice)

The first milestone is a complete, code-driven RPG loop:

1. You spawn with stats (level, XP, health) loaded from your saved profile, on a
   spawn pad placed outside every enemy's reach (a tested invariant).
2. **Ghouls and robots** spawn automatically — no Studio building required —
   and idle enemies **wander** around their posts. Ghouls are fragile, fast,
   and land quick scratches; robots take longer to put down, close in slowly,
   and hit like a piston.
3. **Everything is hostile.** Get inside an enemy's aggro range and it charges;
   in melee range it swings on its own cooldown. Both kinds are slower than
   you, so you can always run.
4. Enemies **leash**: drag one too far from its post and it gives up, heals to
   full, and walks home — no farming a fight it can't win from its doorstep.
5. **Left-click an enemy** within range to attack it (the server validates range
   and enforces an attack cooldown; the client is never trusted).
6. When an enemy's HP hits zero it awards XP for its type and respawns after
   that type's delay.
7. XP fills the bar; enough XP **levels you up**, raising max health and showing
   a "Level up!" toast.
8. **Dying costs your unbanked XP** — progress toward the next level resets to
   zero, but a level once earned is never lost.
9. Your level/XP is **saved to a DataStore** and reloaded next time you join.

> **DataStore note:** persistence only works in a published place, or in Studio
> with **Game Settings → Security → _Enable Studio Access to API Services_**
> turned on. Without it the game still runs — progress just resets each session.

All gameplay numbers live in `src/shared/config/game.ts`, so tuning is one edit.

## Project layout

```
src/
├── client/   # LocalScripts — run on each player's device (*.client.ts)
├── server/   # Scripts — run on the server (*.server.ts)
└── shared/   # Modules imported by both client and server
```

- `default.project.json` — the Rojo mapping of `out/` folders into Roblox services.
- `tsconfig.json` — roblox-ts compiler settings.
- `eslint.config.mjs` — lint rules (flat config, ESLint 9).
- `pnpm-workspace.yaml` — pins `nodeLinker: hoisted`. Rojo maps `node_modules/@rbxts`
  into the place, so `node_modules` has to stay flat rather than pnpm's default
  symlinks-into-`.pnpm` layout. Don't remove it.
- Compiled Luau lands in `out/` and the runtime library in `include/` — both are gitignored.

## Package scripts

| Command | What it does |
| ------- | ------------ |
| `pnpm build` | Compile once (`rbxtsc`) |
| `pnpm watch` | Compile and re-compile on file changes |
| `pnpm serve` | Start the Rojo server for Studio |
| `pnpm lint` | Lint with ESLint + roblox-ts rules |
| `pnpm prettier` | Check formatting |
| `pnpm prettier:fix` | Auto-format the source |
| `pnpm build:place` | Compile and build `game.rbxlx` |
| `pnpm test:logic` | Headless: progression math and config invariants |
| `pnpm test:ai` | Headless: every enemy-brain state transition |
| `pnpm test:spawn` | Headless: enemies spawn correctly on the ground |

The headless tests drive Roblox Studio via `run-in-roblox` — **close Studio
before running them** (and see [docs/studio-testing.md](docs/studio-testing.md)
for the play-mode test they can't cover).

## Adding libraries

roblox-ts packages are published under the [`@rbxts`](https://www.npmjs.com/org/rbxts)
scope. For example:

```bash
pnpm add @rbxts/net              # networking
pnpm add @rbxts/roact            # UI (React-like)
pnpm add @rbxts/profileservice   # datastore wrapper
```

Import them like any TypeScript module: `import Roact from "@rbxts/roact";`.

## CI

`.github/workflows/ci.yml` compiles the project and runs the linter on every
push and pull request.
