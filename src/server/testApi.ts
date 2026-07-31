/**
 * A server-only bridge that lets play-mode tests drive the live services.
 *
 * Why it exists: the Studio MCP's execute_luau (and the command bar) run in a
 * separate Lua environment from game scripts, and Roblox does not share
 * ModuleScript require results across environments — requiring a module from
 * a test yields a fresh, empty copy with none of the live state. Instances DO
 * cross that boundary, so the bridge is BindableFunctions in ServerStorage:
 * the callbacks below close over the real service instances, and a test
 * invokes them by Instance.
 *
 * ServerStorage never replicates, so no client can see or touch this. It
 * grants nothing a server-side actor couldn't already do by hand.
 */

import { ServerStorage } from "@rbxts/services";
import { create } from "shared/create";
import { CombatService } from "server/combat/CombatService";
import { EnemyService } from "server/combat/EnemyService";
import { PlayerDataService } from "server/data/PlayerDataService";

export function createTestApi(playerData: PlayerDataService, enemies: EnemyService, combat: CombatService): void {
	const addXp = create("BindableFunction", { Name: "AddXp" });
	addXp.OnInvoke = (player: Player, amount: number) => {
		playerData.addXp(player, amount);
	};

	const damageEnemy = create("BindableFunction", { Name: "DamageEnemy" });
	damageEnemy.OnInvoke = (model: Model, amount: number): boolean | undefined => {
		const handle = enemies.getHandle(model);
		if (handle === undefined) return undefined;
		return enemies.applyDamage(handle, amount);
	};

	const getEnemyHealth = create("BindableFunction", { Name: "GetEnemyHealth" });
	getEnemyHealth.OnInvoke = (model: Model): number | undefined => {
		return enemies.getHandle(model)?.health;
	};

	// The full server attack path — equipped-weapon lookup, range, cooldown —
	// exactly as a click reaches it, minus only the client remote.
	const attack = create("BindableFunction", { Name: "Attack" });
	attack.OnInvoke = (player: Player, target: Instance) => {
		combat.attack(player, target);
	};

	create("Folder", {
		Name: "TestApi",
		Children: [addXp, damageEnemy, getEnemyHealth, attack],
		Parent: ServerStorage,
	});
}
