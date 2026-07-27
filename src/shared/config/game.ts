/** Central gameplay tuning — the single source of truth for server and client. */

export const Combat = {
	/** Damage a single player attack deals to an enemy. */
	attackDamage: 20,
	/** Maximum distance (studs) between player and enemy for an attack to land. */
	attackRange: 14,
	/** Minimum seconds between a player's attacks, enforced on the server. */
	attackCooldown: 0.5,
} as const;

export const Enemies = {
	/** Hit points a training dummy spawns with. */
	maxHealth: 60,
	/** XP awarded to the killer when a dummy dies. */
	xpReward: 25,
	/** Seconds before a defeated dummy respawns. */
	respawnDelay: 3,
} as const;

export const Progression = {
	baseMaxHealth: 100,
	/** Additional max health granted per level gained. */
	healthPerLevel: 20,
} as const;

/** XP required to advance from `level` to `level + 1`. */
export function xpToNext(level: number): number {
	return math.floor(100 * level ** 1.5);
}

/** Max health a player has at a given level. */
export function maxHealthForLevel(level: number): number {
	return Progression.baseMaxHealth + (level - 1) * Progression.healthPerLevel;
}
