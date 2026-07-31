/**
 * Resolves attack requests authoritatively: validates the equipped weapon,
 * target, range, and cooldown, applies damage with visible feedback, and
 * awards XP on kill.
 *
 * The client only ever says "I attacked this model". Which weapon, how much
 * damage, from how far, how often — all of that is read server-side from the
 * equipped Tool's WeaponId attribute and shared config. A client that lies
 * about its weapon changes nothing.
 */

import { Players } from "@rbxts/services";
import { Remotes } from "shared/remotes";
import { EnemyKinds, Weapon, WeaponId, Weapons } from "shared/config/game";
import { EnemyService } from "server/combat/EnemyService";
import { PlayerDataService } from "server/data/PlayerDataService";
import { damageNumber, impactSound } from "server/combat/Effects";

const HIT_NUMBER_COLOR = Color3.fromRGB(255, 220, 120);

/** The cooldown belongs to the weapon that started it, so both are stored. */
interface AttackStamp {
	readonly time: number;
	readonly cooldown: number;
}

export class CombatService {
	private readonly lastAttack = new Map<Player, AttackStamp>();

	constructor(
		private readonly enemies: EnemyService,
		private readonly data: PlayerDataService,
	) {}

	public start(): void {
		Remotes.Server.Get("AttackEnemy").Connect((player, target) => this.attack(player, target));
		Players.PlayerRemoving.Connect((player) => this.lastAttack.delete(player));
	}

	/** Public so the play-mode TestApi can exercise the real attack path. */
	public attack(player: Player, target: Instance): void {
		if (!target.IsA("Model")) return;
		if (!this.enemies.isEnemy(target)) return;

		const handle = this.enemies.getHandle(target);
		if (handle === undefined) return;

		const weapon = this.equippedWeapon(player);
		if (weapon === undefined) return;

		if (this.onCooldown(player)) return;
		if (!this.inRange(player, target, weapon.range)) return;

		this.lastAttack.set(player, { time: os.clock(), cooldown: weapon.cooldown });

		// Feedback before the kill check, so the fatal hit still shows its
		// number and sound at the spot where the enemy stood.
		const body = target.PrimaryPart;
		if (body !== undefined) {
			damageNumber(body.Position.add(new Vector3(0, body.Size.Y / 2 + 1, 0)), weapon.damage, HIT_NUMBER_COLOR);
			impactSound(body, "splat.wav", 0.6);
		}

		const died = this.enemies.applyDamage(handle, weapon.damage);
		if (died) {
			this.data.addXp(player, EnemyKinds[handle.kind].xpReward);
		}
	}

	/**
	 * The weapon in the player's hands right now, or nothing. Unarmed players
	 * can't attack — there is no fist fallback, deliberately: every damage
	 * number on screen traces back to a weapon in config.
	 */
	private equippedWeapon(player: Player): Weapon | undefined {
		const tool = player.Character?.FindFirstChildOfClass("Tool");
		if (tool === undefined) return undefined;

		const id = tool.GetAttribute("WeaponId") as WeaponId | undefined;
		return id !== undefined ? Weapons[id] : undefined;
	}

	private onCooldown(player: Player): boolean {
		const last = this.lastAttack.get(player);
		if (last === undefined) return false;
		return os.clock() - last.time < last.cooldown;
	}

	private inRange(player: Player, target: Model, range: number): boolean {
		const root = player.Character?.FindFirstChild("HumanoidRootPart") as BasePart | undefined;
		if (root === undefined) return false;

		const distance = root.Position.sub(target.GetPivot().Position).Magnitude;
		return distance <= range;
	}
}
