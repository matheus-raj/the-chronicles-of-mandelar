/**
 * Resolves client attack requests authoritatively: validates target, range,
 * and cooldown, applies damage, and awards XP on kill.
 */

import { Players } from "@rbxts/services";
import { Remotes } from "shared/remotes";
import { Combat, EnemyKinds } from "shared/config/game";
import { EnemyService } from "server/combat/EnemyService";
import { PlayerDataService } from "server/data/PlayerDataService";

export class CombatService {
	private readonly lastAttack = new Map<Player, number>();

	constructor(
		private readonly enemies: EnemyService,
		private readonly data: PlayerDataService,
	) {}

	public start(): void {
		Remotes.Server.Get("AttackEnemy").Connect((player, target) => this.onAttack(player, target));
		Players.PlayerRemoving.Connect((player) => this.lastAttack.delete(player));
	}

	private onAttack(player: Player, target: Instance): void {
		if (!target.IsA("Model")) return;
		if (!this.enemies.isEnemy(target)) return;

		const handle = this.enemies.getHandle(target);
		if (handle === undefined) return;

		if (this.onCooldown(player)) return;
		if (!this.inRange(player, target)) return;

		this.lastAttack.set(player, os.clock());

		const died = this.enemies.applyDamage(handle, Combat.attackDamage);
		if (died) {
			this.data.addXp(player, EnemyKinds[handle.kind].xpReward);
		}
	}

	private onCooldown(player: Player): boolean {
		const last = this.lastAttack.get(player);
		if (last === undefined) return false;
		return os.clock() - last < Combat.attackCooldown;
	}

	private inRange(player: Player, target: Model): boolean {
		const root = player.Character?.FindFirstChild("HumanoidRootPart") as BasePart | undefined;
		if (root === undefined) return false;

		const distance = root.Position.sub(target.GetPivot().Position).Magnitude;
		return distance <= Combat.attackRange;
	}
}
