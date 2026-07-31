/**
 * Types shared between the server and client.
 */

/** A snapshot of a player's progression, replicated from server to client for the HUD. */
export interface PlayerStats {
	level: number;
	/** XP accumulated toward the next level (not lifetime XP). */
	xp: number;
	/** The portion of `xp` that is banked — it survives death. The rest is at risk. */
	bankedXp: number;
	/** XP required to advance from the current level to the next. */
	xpToNext: number;
	health: number;
	maxHealth: number;
}

/** The persisted shape written to the DataStore. Health/maxHealth are derived, not stored. */
export interface SavedPlayerData {
	level: number;
	xp: number;
	/** How much of `xp` is banked (death-proof). Absent in pre-banking saves. */
	bankedXp: number;
}
