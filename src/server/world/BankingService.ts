/**
 * Builds the Sunwell — the beacon where players bank their at-risk XP — and
 * wires its prompt to PlayerDataService.
 *
 * Like everything else in the world, it is built in code from config: its
 * position, prompt range, and hold time all live in shared/config/game.ts,
 * where the placement tests can see them.
 */

import { Workspace } from "@rbxts/services";
import { Banking } from "shared/config/game";
import { create } from "shared/create";
import { damageNumber, flash, impactSound } from "server/combat/Effects";
import { PlayerDataService } from "server/data/PlayerDataService";

/** Appearance lives here rather than in shared config — config is for tuning. */
const PEDESTAL_COLOR = Color3.fromRGB(158, 152, 138);
const CRYSTAL_COLOR = Color3.fromRGB(255, 214, 90);
const BANK_FLASH = Color3.fromRGB(255, 255, 255);
const BANKED_NUMBER = Color3.fromRGB(140, 220, 120);

const PEDESTAL_SIZE = new Vector3(4, 1, 4);
const CRYSTAL_SIZE = new Vector3(1.6, 3.2, 1.6);
const CRYSTAL_HOVER = 1.2;

export class BankingService {
	public constructor(private readonly playerData: PlayerDataService) {}

	public start(): void {
		const ground = Banking.stationPosition;

		const pedestal = create("Part", {
			Name: "Pedestal",
			Size: PEDESTAL_SIZE,
			Position: new Vector3(ground.X, PEDESTAL_SIZE.Y / 2, ground.Z),
			Anchored: true,
			Material: Enum.Material.Slate,
			Color: PEDESTAL_COLOR,
			TopSurface: Enum.SurfaceType.Smooth,
			BottomSurface: Enum.SurfaceType.Smooth,
		});

		// The crystal hovers above the pedestal, rotated 45° so it reads as a
		// gem rather than a box, and glows: visible from the fight, so walking
		// back to bank is navigation by landmark, not by memory.
		const crystal = create("Part", {
			Name: "Crystal",
			Size: CRYSTAL_SIZE,
			CFrame: new CFrame(ground.X, PEDESTAL_SIZE.Y + CRYSTAL_HOVER + CRYSTAL_SIZE.Y / 2, ground.Z).mul(
				CFrame.Angles(0, math.rad(45), 0),
			),
			Anchored: true,
			CanCollide: false,
			Material: Enum.Material.Neon,
			Color: CRYSTAL_COLOR,
			Children: [
				create("PointLight", { Color: CRYSTAL_COLOR, Brightness: 2, Range: 24 }),
				create("ProximityPrompt", {
					ActionText: "Bank XP",
					ObjectText: "Sunwell",
					HoldDuration: Banking.holdSeconds,
					MaxActivationDistance: Banking.promptRange,
					RequiresLineOfSight: false,
				}),
			],
		});

		const prompt = crystal.FindFirstChildOfClass("ProximityPrompt")!;
		prompt.Triggered.Connect((player) => {
			const banked = this.playerData.bankXp(player);
			// The no-op case still toasts (PlayerDataService handles that);
			// the flourish is reserved for actually protecting something.
			if (banked > 0) {
				flash(crystal, BANK_FLASH, CRYSTAL_COLOR);
				impactSound(crystal, "electronicpingshort.wav", 0.8);
				damageNumber(crystal.Position.add(new Vector3(0, CRYSTAL_SIZE.Y / 2, 0)), banked, BANKED_NUMBER);
			}
		});

		create("Model", {
			Name: "Sunwell",
			Children: [pedestal, crystal],
			Parent: Workspace,
		});
	}
}
