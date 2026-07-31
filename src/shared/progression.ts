/**
 * Pure progression rules: awarding XP, banking it, and paying for death.
 *
 * The server (PlayerDataService) applies these; the headless tests
 * (tests/progression.spec.luau) exercise the very same functions — no
 * mirrored reimplementation to drift out of sync.
 *
 * The model: `xp` is all progress toward the next level; `bankedXp` is the
 * portion of it that survives death. Kills earn at-risk XP; banking at the
 * Sunwell converts at-risk to banked; dying resets `xp` down to `bankedXp`.
 * A level, once gained, is itself permanent — the ultimate bank.
 *
 * Invariant, preserved by every function here: 0 <= bankedXp <= xp.
 */

import { xpToNext } from "shared/config/game";

export interface ProgressState {
	readonly level: number;
	/** XP toward the next level — banked and at-risk together. */
	readonly xp: number;
	/** The portion of `xp` that survives death. */
	readonly bankedXp: number;
}

/**
 * Add XP and apply any level-ups.
 *
 * Level-up cost is paid from the banked portion first: leveling is the
 * permanent form of progress, so protected XP becomes a protected level.
 * Whatever spills over past the level threshold is the freshly earned
 * remainder, and it stays at risk until banked.
 */
export function awardXp(state: ProgressState, amount: number): { state: ProgressState; levelsGained: number } {
	let level = state.level;
	let xp = state.xp + amount;
	let bankedXp = state.bankedXp;
	let levelsGained = 0;

	while (xp >= xpToNext(level)) {
		const cost = xpToNext(level);
		xp -= cost;
		bankedXp = math.max(0, bankedXp - cost);
		level += 1;
		levelsGained += 1;
	}

	return { state: { level, xp, bankedXp }, levelsGained };
}

/** Protect all current XP. Returns how much was newly banked (0 if nothing was at risk). */
export function bankXp(state: ProgressState): { state: ProgressState; banked: number } {
	const banked = state.xp - state.bankedXp;
	return { state: { level: state.level, xp: state.xp, bankedXp: state.xp }, banked };
}

/** The death penalty: at-risk XP is lost, banked XP and the level survive. */
export function applyDeath(state: ProgressState): { state: ProgressState; lost: number } {
	const lost = state.xp - state.bankedXp;
	return { state: { level: state.level, xp: state.bankedXp, bankedXp: state.bankedXp }, lost };
}
