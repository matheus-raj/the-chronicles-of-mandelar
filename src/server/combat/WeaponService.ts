/**
 * Builds the weapon Tools in code and hands them to players on spawn.
 *
 * Weapons are Roblox Tools: they appear in the hotbar, equip to the right
 * hand automatically, and fire Tool.Activated on click *and* on tap, which
 * gives mobile support for free (the old raw-mouse listener had none). Each
 * Tool carries a WeaponId attribute; the server never trusts the Tool's
 * stats — CombatService looks the id up in shared config on every swing.
 *
 * Appearance lives here, not in config, per the same rule as enemy looks:
 * config is the tuning surface, and a blade's glow decides no fight.
 */

import { Players } from "@rbxts/services";
import { StarterWeapons, WeaponId, Weapons } from "shared/config/game";
import { create } from "shared/create";

interface WeaponLook {
	readonly size: Vector3;
	readonly color: Color3;
	readonly material: Enum.Material;
	/** How far below the handle's centre the hand grips (studs). */
	readonly gripDrop: number;
}

const LOOKS: { readonly [K in WeaponId]: WeaponLook } = {
	// A bar of captured sunlight — long, thin, faintly glowing.
	SunforgedBlade: {
		size: new Vector3(0.4, 4.2, 0.4),
		color: Color3.fromRGB(235, 200, 90),
		material: Enum.Material.Neon,
		gripDrop: 1.4,
	},
	// Living wood, grown not carved — short, thick, heavy.
	VerdantMaul: {
		size: new Vector3(0.9, 3.2, 0.9),
		color: Color3.fromRGB(110, 160, 90),
		material: Enum.Material.Wood,
		gripDrop: 1.1,
	},
};

export class WeaponService {
	public start(): void {
		Players.PlayerAdded.Connect((player) => this.onPlayerAdded(player));
		for (const player of Players.GetPlayers()) {
			this.onPlayerAdded(player);
		}
	}

	private onPlayerAdded(player: Player): void {
		const outfit = (character: Model) => this.outfit(player, character);
		if (player.Character !== undefined) outfit(player.Character);
		player.CharacterAdded.Connect(outfit);
	}

	/** Fresh weapons every spawn — the Backpack is wiped on death anyway. */
	private outfit(player: Player, character: Model): void {
		const backpack = player.WaitForChild("Backpack");

		StarterWeapons.forEach((id, index) => {
			const tool = this.buildTool(id);
			tool.Parent = backpack;

			// Equip the first weapon so a new player is armed without knowing
			// the hotbar exists yet.
			if (index === 0) {
				const humanoid = character.WaitForChild("Humanoid") as Humanoid;
				humanoid.EquipTool(tool);
			}
		});
	}

	private buildTool(id: WeaponId): Tool {
		const look = LOOKS[id];

		const handle = create("Part", {
			Name: "Handle",
			Size: look.size,
			Color: look.color,
			Material: look.material,
			CanCollide: false,
		});

		const tool = create("Tool", {
			Name: Weapons[id].displayName,
			CanBeDropped: false,
			GripPos: new Vector3(0, -look.gripDrop, 0),
			Children: [handle],
		});
		tool.SetAttribute("WeaponId", id);
		return tool;
	}
}
