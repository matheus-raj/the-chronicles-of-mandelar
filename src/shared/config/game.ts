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

/** The armoury. Add a member here to add a weapon. */
export type WeaponId = "SunforgedBlade" | "VerdantMaul";

export interface Weapon {
	/** Shown on the Tool in the hotbar; also the Tool's Name. */
	readonly displayName: string;
	/** Damage one swing deals to an enemy. */
	readonly damage: number;
	/** Maximum distance (studs) to the target for a swing to land, server-validated. */
	readonly range: number;
	/** Minimum seconds between swings, enforced on the server. */
	readonly cooldown: number;
}

/**
 * Per-weapon tuning. The blade is the all-rounder (the pre-weapon numbers,
 * unchanged); the maul trades reach and speed for hits that fell a ghoul in
 * two. Appearance lives with the tool-building code in WeaponService — this
 * file is the gameplay tuning surface.
 *
 * Invariants enforced by tests/progression.spec.luau: every weapon outranges
 * every enemy's attackRange (kiting stays possible), and no weapon one-shots
 * even the weakest enemy.
 */
export const Weapons: { readonly [K in WeaponId]: Weapon } = {
	SunforgedBlade: { displayName: "Sunforged Blade", damage: 20, range: 14, cooldown: 0.5 },
	VerdantMaul: { displayName: "Verdant Maul", damage: 45, range: 10, cooldown: 1.4 },
};

/** Every player gets these on spawn; the first one starts equipped. */
export const StarterWeapons: ReadonlyArray<WeaponId> = ["SunforgedBlade", "VerdantMaul"];

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
	/** Studs per second while chasing (wandering ambles at half this). */
	readonly moveSpeed: number;
	/** How far from its post an idle enemy will amble. */
	readonly wanderRadius: number;
	/** A player closer than this (XZ studs) gets charged. Everything is hostile. */
	readonly aggroRange: number;
	/** Close enough (XZ studs) to swing instead of chase. */
	readonly attackRange: number;
	/** Damage one swing deals to a player. */
	readonly attackDamage: number;
	/** Seconds between swings. */
	readonly attackInterval: number;
	/** Chasing further than this from its post breaks the leash: heal, go home. */
	readonly leashRange: number;
}

/**
 * Per-type tuning. Ghouls are fragile, fast, and land quick scratches; robots
 * take longer to put down, close in slowly, and hit like a piston. Both charge
 * on sight. Default player walk speed is 16, so both kinds can be outrun.
 *
 * Appearance deliberately lives with the spawning code in EnemyService rather
 * than here — this file is the gameplay tuning surface, not a presentation one.
 */
export const EnemyKinds: { readonly [K in EnemyKindId]: EnemyKind } = {
	Ghoul: {
		displayName: "Ghoul",
		maxHealth: 60,
		xpReward: 25,
		respawnDelay: 3,
		moveSpeed: 12,
		wanderRadius: 8,
		aggroRange: 24,
		attackRange: 6,
		attackDamage: 8,
		attackInterval: 1.2,
		leashRange: 48,
	},
	Robot: {
		displayName: "Robot",
		maxHealth: 90,
		xpReward: 40,
		respawnDelay: 6,
		moveSpeed: 6,
		wanderRadius: 4,
		aggroRange: 16,
		attackRange: 7,
		attackDamage: 20,
		attackInterval: 2.5,
		leashRange: 40,
	},
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
 *
 * Placement rule (enforced by tests/progression.spec.luau): every post must be
 * far enough from the spawn pad that a freshly spawned player can't be aggroed
 * while standing on it — further than aggroRange + wanderRadius + half the pad,
 * since everything charges on sight and idle enemies drift around their post.
 */
export const EnemySpawns: ReadonlyArray<{ readonly kind: EnemyKindId; readonly position: Vector3 }> = [
	{ kind: "Ghoul", position: new Vector3(0, 0, -48) },
	{ kind: "Ghoul", position: new Vector3(14, 0, -52) },
	{ kind: "Robot", position: new Vector3(-14, 0, -44) },
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
