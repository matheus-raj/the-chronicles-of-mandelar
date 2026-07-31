/** Central gameplay tuning — the single source of truth for server and client. */

/**
 * The ground and where players arrive on it.
 *
 * A Rojo-built place starts genuinely empty — no baseplate, no SpawnLocation —
 * so without this the character spawns into open air, falls past
 * FallenPartsDestroyHeight, is destroyed, respawns, and falls again. The world
 * is built in code by WorldService, same as the enemies.
 */
export const World = {
	/** Side length (studs) of the square ground slab. */
	groundSize: 512,
	/** Thickness of the slab. Its top face sits at y = 0, so ground level is 0. */
	groundThickness: 8,
	/** Side length (studs) of the square spawn pad resting on the ground. */
	spawnPadSize: 16,
} as const;

export const Combat = {
	/** Damage a single player attack deals to an enemy. */
	attackDamage: 20,
	/** Maximum distance (studs) between player and enemy for an attack to land. */
	attackRange: 14,
	/** Minimum seconds between a player's attacks, enforced on the server. */
	attackCooldown: 0.5,
} as const;

/** The threats to Mandelar. Add a member here to add an enemy type. */
export type EnemyKindId = "Ghoul" | "Robot";

export interface EnemyKind {
	/** Shown on the model and in the world; also the Model's Name. */
	readonly displayName: string;
	/** Hit points one of these spawns with. */
	readonly maxHealth: number;
	/** XP awarded to the killer when one dies. */
	readonly xpReward: number;
	/** Seconds before a defeated one returns. */
	readonly respawnDelay: number;
}

/**
 * Per-type tuning. Ghouls are fragile and come back quickly; robots take longer
 * to put down and longer to rebuild, and pay out accordingly.
 *
 * Appearance deliberately lives with the spawning code in EnemyService rather
 * than here — this file is the gameplay tuning surface, not a presentation one.
 */
export const EnemyKinds: { readonly [K in EnemyKindId]: EnemyKind } = {
	Ghoul: { displayName: "Ghoul", maxHealth: 60, xpReward: 25, respawnDelay: 3 },
	Robot: { displayName: "Robot", maxHealth: 90, xpReward: 40, respawnDelay: 6 },
};

/**
 * What spawns where, relative to the world origin.
 *
 * Positions are *ground* positions — where the enemy's feet go, not the centre
 * of its body. EnemyService lifts each model by half its own height, so types
 * of different sizes all stand on the floor from the same y. Ground level is 0.
 *
 * Lives in config rather than inside EnemyService so the spawn tests can derive
 * what they expect instead of hardcoding counts and names. Adding an enemy to
 * the world is an edit here and nowhere else.
 */
export const EnemySpawns: ReadonlyArray<{ readonly kind: EnemyKindId; readonly position: Vector3 }> = [
	{ kind: "Ghoul", position: new Vector3(0, 0, -20) },
	{ kind: "Ghoul", position: new Vector3(10, 0, -24) },
	{ kind: "Robot", position: new Vector3(-10, 0, -24) },
];

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
