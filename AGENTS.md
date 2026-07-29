# AGENTS.md

Conventions for anyone (human or AI) writing code in this repository.

## Guiding principle

**Favor functional programming as much as we reasonably can. Use OOP only when
it genuinely fits.**

This is a preference, not a dogma — readability and correctness win over
purity. When a functional approach and an object-oriented one are equally
clear, choose the functional one.

## Prefer (functional-first)

- **Pure functions.** Given the same input, return the same output with no side
  effects. Keep side effects (mutating instances, DataStore calls, remotes) at
  the edges, isolated from the logic they drive.
- **Immutability.** Don't mutate inputs. Build new values (`map`/`filter`/
  reduce, object spreads) instead of mutating in place. Use `readonly` and
  `as const` where it helps.
- **Declarative construction over line-by-line mutation.** Build things from a
  single data/props object rather than creating something and then assigning
  field after field. For Roblox Instances this means a helper that takes a
  props object, e.g.:

  ```ts
  // Prefer
  const label = create("TextLabel", {
      Text: "Level 1",
      TextScaled: true,
      BackgroundTransparency: 1,
      Parent: panel,
  });

  // Over
  const label = new Instance("TextLabel");
  label.Text = "Level 1";
  label.TextScaled = true;
  label.BackgroundTransparency = 1;
  label.Parent = panel;
  ```

- **Composition over inheritance.** Build behavior by composing small functions,
  not by extending base classes.
- **Small, focused modules** that export functions and plain data. Keep tuning
  and configuration as exported constants (see `src/shared/config/game.ts`).

## Use OOP when it fits

Classes are the right tool for **long-lived stateful systems with a lifecycle**
— the game's services are a good example (`PlayerDataService`, `EnemyService`,
`CombatService`). They own mutable state, are constructed once, wired together,
and started. That is a legitimate, clear use of OOP; don't rewrite it into
closures for the sake of avoiding classes.

Reach for a class when you need to:

- encapsulate mutable state behind a small, invariant-preserving interface, or
- model a single instance with a clear `start()` / lifecycle.

Otherwise, prefer a module of functions.

## Comments and docstrings

- **Docstrings are at most 4 lines**, including the `/**` and `*/` delimiters.
- **Avoid explaining comments.** Prefer readable code — clear names and small
  functions — over comments that restate what the code does.
- When a comment is warranted, explain *why* (non-obvious rationale), not
  *what*. If you feel the need to explain what the code does, rewrite the code.

## Practical rules for this codebase (roblox-ts)

- Keep all gameplay tuning in shared config modules; the server enforces it and
  the client reads from the same source of truth.
- Keep the server authoritative — never trust client input for game outcomes.
- Prefer declarative Instance construction (props object + optional nested
  children) over imperative property assignment.
- Run `pnpm build`, `pnpm lint`, and `pnpm prettier` before committing;
  CI enforces all three.
