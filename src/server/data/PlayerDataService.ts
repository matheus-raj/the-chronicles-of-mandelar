/**
 * Owns each player's progression: loads it from the DataStore on join, keeps it
 * in memory during the session, replicates it to the client, and saves on leave.
 *
 * DataStores only work in a published place, or in Studio with
 * "Game Settings > Security > Enable Studio Access to API Services" turned on.
 * When they're unavailable we fall back to in-memory defaults so the game still
 * runs — progress just won't persist across sessions in that case.
 */

import { DataStoreService, Players } from "@rbxts/services";
import { Remotes } from "shared/remotes";
import { PlayerStats, SavedPlayerData } from "shared/types";
import { maxHealthForLevel, xpToNext } from "shared/config/game";

const STORE_NAME = "PlayerData_v1";
const store = DataStoreService.GetDataStore(STORE_NAME);

function keyFor(player: Player): string {
	return `player_${player.UserId}`;
}

function defaultData(): SavedPlayerData {
	return { level: 1, xp: 0 };
}

export class PlayerDataService {
	private readonly cache = new Map<Player, SavedPlayerData>();
	private readonly syncStats = Remotes.Server.Get("SyncStats");
	private readonly notify = Remotes.Server.Get("Notify");

	public start(): void {
		Players.PlayerAdded.Connect((player) => this.onPlayerAdded(player));
		Players.PlayerRemoving.Connect((player) => this.onPlayerRemoving(player));

		// Handle players already present (e.g. when the script reloads in Studio).
		for (const player of Players.GetPlayers()) {
			this.onPlayerAdded(player);
		}

		// Best-effort flush of every profile when the server shuts down.
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

		data.xp += amount;

		let leveledUp = false;
		while (data.xp >= xpToNext(data.level)) {
			data.xp -= xpToNext(data.level);
			data.level += 1;
			leveledUp = true;
		}

		if (leveledUp) {
			this.applyMaxHealth(player, data.level);
			this.notify.SendToPlayer(player, `Level up! You are now level ${data.level}.`);
		}

		this.push(player, data);
	}

	private onPlayerAdded(player: Player): void {
		const data = this.load(player);
		this.cache.set(player, data);

		const applyToCharacter = (character: Model) => {
			// Wait for the Humanoid so we can size its health to the player's level.
			const humanoid = character.WaitForChild("Humanoid") as Humanoid;
			this.applyMaxHealth(player, data.level, humanoid);
			this.push(player, data);
		};

		if (player.Character !== undefined) applyToCharacter(player.Character);
		player.CharacterAdded.Connect(applyToCharacter);
	}

	private onPlayerRemoving(player: Player): void {
		this.save(player);
		this.cache.delete(player);
	}

	private load(player: Player): SavedPlayerData {
		const [ok, result] = pcall(() => store.GetAsync(keyFor(player)));
		if (ok && typeIs(result, "table")) {
			const saved = result as SavedPlayerData;
			return { level: saved.level, xp: saved.xp };
		}
		if (!ok) {
			warn(`[PlayerDataService] Failed to load data for ${player.Name}: ${result}`);
		}
		return defaultData();
	}

	private save(player: Player): void {
		const data = this.cache.get(player);
		if (data === undefined) return;

		const [ok, err] = pcall(() => store.SetAsync(keyFor(player), data));
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
		// Heal by the amount max health increased so a level-up feels rewarding.
		hum.Health = math.min(newMax, hum.Health + (newMax - previousMax));
	}

	private push(player: Player, data: SavedPlayerData): void {
		this.syncStats.SendToPlayer(player, this.toStats(player, data));
	}

	private toStats(player: Player, data: SavedPlayerData): PlayerStats {
		const humanoid = player.Character?.FindFirstChildOfClass("Humanoid");
		const maxHealth = maxHealthForLevel(data.level);
		return {
			level: data.level,
			xp: data.xp,
			xpToNext: xpToNext(data.level),
			health: humanoid?.Health ?? maxHealth,
			maxHealth,
		};
	}
}
