/**
 * Loads, holds, replicates, and persists each player's progression.
 * Falls back to in-memory data when DataStores are unavailable.
 */

import { DataStoreService, Players } from "@rbxts/services";
import { Remotes } from "shared/remotes";
import { PlayerStats, SavedPlayerData } from "shared/types";
import { maxHealthForLevel, xpToNext } from "shared/config/game";
import { applyDeath, awardXp, bankXp } from "shared/progression";

const STORE_NAME = "PlayerData_v1";

let store: DataStore | undefined;
let storeResolved = false;

/**
 * Resolves the DataStore on first use, or undefined if it isn't available.
 *
 * Deliberately lazy and pcall-guarded: `GetDataStore` throws outright in an
 * unpublished place ("You must publish this place to the web to access
 * DataStore"), which is every Studio playtest. Called at module scope it would
 * abort the import, and with it the whole of main.server — so the world never
 * gets built and no service starts. Failing softly here is what lets the
 * in-memory fallback below actually take over.
 */
function getStore(): DataStore | undefined {
	if (!storeResolved) {
		storeResolved = true;
		const [ok, result] = pcall(() => DataStoreService.GetDataStore(STORE_NAME));
		if (ok) {
			store = result as DataStore;
		} else {
			warn(`[PlayerDataService] DataStores unavailable, progression will not persist: ${result}`);
		}
	}
	return store;
}

function keyFor(player: Player): string {
	return `player_${player.UserId}`;
}

function defaultData(): SavedPlayerData {
	return { level: 1, xp: 0, bankedXp: 0 };
}

export class PlayerDataService {
	private readonly cache = new Map<Player, SavedPlayerData>();
	private readonly syncStats = Remotes.Server.Get("SyncStats");
	private readonly notify = Remotes.Server.Get("Notify");

	public start(): void {
		Players.PlayerAdded.Connect((player) => this.onPlayerAdded(player));
		Players.PlayerRemoving.Connect((player) => this.onPlayerRemoving(player));

		for (const player of Players.GetPlayers()) {
			this.onPlayerAdded(player);
		}

		game.BindToClose(() => {
			for (const [player] of this.cache) {
				this.save(player);
			}
		});
	}

	/** Current stats snapshot, or undefined if the player's data hasn't loaded. */
	public getStats(player: Player): PlayerStats | undefined {
		const data = this.cache.get(player);
		if (data === undefined) return undefined;
		return this.toStats(player, data);
	}

	/** Award XP, applying any level-ups, then replicate the result to the client. */
	public addXp(player: Player, amount: number): void {
		const data = this.cache.get(player);
		if (data === undefined) return;

		const { state, levelsGained } = awardXp(data, amount);
		data.level = state.level;
		data.xp = state.xp;
		data.bankedXp = state.bankedXp;

		if (levelsGained > 0) {
			this.applyMaxHealth(player, data.level);
			this.notify.SendToPlayer(player, `Level up! You are now level ${data.level}.`);
		}

		this.push(player, data);
	}

	/**
	 * Bank all at-risk XP (the Sunwell's prompt lands here). Returns how much
	 * was newly protected, so the station can skip its flourish on a no-op.
	 */
	public bankXp(player: Player): number {
		const data = this.cache.get(player);
		if (data === undefined) return 0;

		const { state, banked } = bankXp(data);
		data.bankedXp = state.bankedXp;

		if (banked > 0) {
			this.notify.SendToPlayer(player, `Banked ${banked} XP — it is safe now, even in death.`);
			this.push(player, data);
		} else {
			this.notify.SendToPlayer(player, "Nothing to bank — go earn some XP first.");
		}
		return banked;
	}

	private onPlayerAdded(player: Player): void {
		const data = this.load(player);
		this.cache.set(player, data);

		const applyToCharacter = (character: Model) => {
			const humanoid = character.WaitForChild("Humanoid") as Humanoid;
			this.applyMaxHealth(player, data.level, humanoid);
			this.push(player, data);
			humanoid.Died.Connect(() => this.onDied(player));
		};

		if (player.Character !== undefined) applyToCharacter(player.Character);
		player.CharacterAdded.Connect(applyToCharacter);
	}

	/**
	 * Death penalty: at-risk XP is lost; banked XP and the level survive.
	 * Dying is a real cost without ever undoing something already earned —
	 * or deliberately protected at the Sunwell.
	 */
	private onDied(player: Player): void {
		const data = this.cache.get(player);
		if (data === undefined) return;

		const { state, lost } = applyDeath(data);
		data.xp = state.xp;
		this.push(player, data);

		if (lost > 0) {
			this.notify.SendToPlayer(player, `You have fallen — ${lost} unbanked XP lost.`);
		} else if (data.bankedXp > 0) {
			this.notify.SendToPlayer(player, "You have fallen — your banked XP held.");
		} else {
			this.notify.SendToPlayer(player, "You have fallen.");
		}
	}

	private onPlayerRemoving(player: Player): void {
		this.save(player);
		this.cache.delete(player);
	}

	private load(player: Player): SavedPlayerData {
		const dataStore = getStore();
		if (dataStore === undefined) return defaultData();

		const [ok, result] = pcall(() => dataStore.GetAsync(keyFor(player)));
		if (ok && typeIs(result, "table")) {
			const saved = result as Partial<SavedPlayerData>;
			const level = saved.level ?? 1;
			const xp = saved.xp ?? 0;
			// Saves from before banking existed carry no bankedXp. Grandfather
			// that XP as fully banked: those players never had a chance to
			// protect it, so the new death rule shouldn't retroactively
			// endanger it. Clamped to keep the bankedXp <= xp invariant.
			const bankedXp = math.clamp(saved.bankedXp ?? xp, 0, xp);
			return { level, xp, bankedXp };
		}
		if (!ok) {
			warn(`[PlayerDataService] Failed to load data for ${player.Name}: ${result}`);
		}
		return defaultData();
	}

	private save(player: Player): void {
		const data = this.cache.get(player);
		if (data === undefined) return;

		const dataStore = getStore();
		if (dataStore === undefined) return;

		const [ok, err] = pcall(() => dataStore.SetAsync(keyFor(player), data));
		if (!ok) {
			warn(`[PlayerDataService] Failed to save data for ${player.Name}: ${err}`);
		}
	}

	private applyMaxHealth(player: Player, level: number, humanoid?: Humanoid): void {
		const character = player.Character;
		const hum = humanoid ?? (character?.FindFirstChildOfClass("Humanoid") as Humanoid | undefined);
		if (hum === undefined) return;

		const previousMax = hum.MaxHealth;
		const newMax = maxHealthForLevel(level);
		hum.MaxHealth = newMax;
		// Heal by the max-health gain so leveling feels rewarding.
		hum.Health = math.min(newMax, hum.Health + (newMax - previousMax));
	}

	private push(player: Player, data: SavedPlayerData): void {
		this.syncStats.SendToPlayer(player, this.toStats(player, data));
		// Mirrored as attributes so server-side observers — play-mode tests,
		// future leaderboards — can read progression without a service handle.
		player.SetAttribute("Level", data.level);
		player.SetAttribute("XP", data.xp);
		player.SetAttribute("BankedXP", data.bankedXp);
	}

	private toStats(player: Player, data: SavedPlayerData): PlayerStats {
		const humanoid = player.Character?.FindFirstChildOfClass("Humanoid");
		const maxHealth = maxHealthForLevel(data.level);
		return {
			level: data.level,
			xp: data.xp,
			bankedXp: data.bankedXp,
			xpToNext: xpToNext(data.level),
			health: humanoid?.Health ?? maxHealth,
			maxHealth,
		};
	}
}
