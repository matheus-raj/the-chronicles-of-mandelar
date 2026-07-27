# The Chronicles of Mandelar

A Roblox game written in **TypeScript** using [roblox-ts](https://roblox-ts.com/),
which compiles TypeScript into Luau. Code is synced into Roblox Studio with
[Rojo](https://rojo.space/).

## Prerequisites

Install these once on your machine:

| Tool | Purpose | Install |
| ---- | ------- | ------- |
| [Node.js](https://nodejs.org/) (LTS) | Runs the roblox-ts compiler | Download installer |
| [Rojo](https://rojo.space/docs/v7/getting-started/installation/) | Syncs compiled code into Studio | `cargo install rojo` or the [Aftman/Rokit](https://github.com/rojo-rbx/rokit) toolchain manager |
| [Roblox Studio](https://create.roblox.com/) | The editor/runtime for the game | Download from Roblox |
| **Rojo Studio plugin** | Connects Studio to the local Rojo server | Install from the Studio plugin marketplace or `rojo plugin install` |

The **roblox-ts** and **Rojo** VS Code extensions are recommended (see
`.vscode/extensions.json`).

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Compile TypeScript -> Luau, and re-compile on every save
npm run watch

# 3. In a second terminal, start the Rojo server
npm run serve
```

Then, in Roblox Studio: open a new baseplate, open the **Rojo** plugin, and
click **Connect**. Your compiled code streams into the place live. Press
**Play** and check the Output window — you should see the greeting printed by
`src/server/main.server.ts`.

## Gameplay (current vertical slice)

The first milestone is a complete, code-driven RPG loop:

1. You spawn with stats (level, XP, health) loaded from your saved profile.
2. Three **training dummies** spawn automatically — no Studio building required.
3. **Left-click a dummy** within range to attack it (the server validates range
   and enforces an attack cooldown; the client is never trusted).
4. When a dummy's HP hits zero it awards XP and respawns after a few seconds.
5. XP fills the bar; enough XP **levels you up**, raising max health and showing
   a "Level up!" toast.
6. Your level/XP is **saved to a DataStore** and reloaded next time you join.

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
- Compiled Luau lands in `out/` and the runtime library in `include/` — both are gitignored.

## npm scripts

| Command | What it does |
| ------- | ------------ |
| `npm run build` | Compile once (`rbxtsc`) |
| `npm run watch` | Compile and re-compile on file changes |
| `npm run serve` | Start the Rojo server for Studio |
| `npm run lint` | Lint with ESLint + roblox-ts rules |
| `npm run prettier` | Check formatting |
| `npm run prettier:fix` | Auto-format the source |

## Adding libraries

roblox-ts packages are published under the [`@rbxts`](https://www.npmjs.com/org/rbxts)
scope. For example:

```bash
npm install @rbxts/net       # networking
npm install @rbxts/roact      # UI (React-like)
npm install @rbxts/profileservice  # datastore wrapper
```

Import them like any TypeScript module: `import Roact from "@rbxts/roact";`.

## CI

`.github/workflows/ci.yml` compiles the project and runs the linter on every
push and pull request.
