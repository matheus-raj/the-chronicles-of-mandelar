/**
 * Builds the ground and the spawn pad.
 *
 * A place built by Rojo contains only what default.project.json declares, and
 * that tree declares no geometry at all — no baseplate, no SpawnLocation. Left
 * alone, a joining character has nothing to stand on: it falls past
 * Workspace.FallenPartsDestroyHeight, is destroyed, respawns, and falls again.
 *
 * So the floor is built in code, the same way the enemies are. This has to run
 * before anything else in main.server, because a player can be added the moment
 * the server starts and there is no point spawning enemies into a void.
 */

import { Workspace } from "@rbxts/services";
import { World } from "shared/config/game";
import { create } from "shared/create";

/** Appearance lives here rather than in shared config — config is for tuning. */
const GROUND_COLOR = Color3.fromRGB(94, 138, 82);
const SPAWN_PAD_COLOR = Color3.fromRGB(214, 196, 140);

export class WorldService {
	public start(): void {
		this.buildGround();
		this.buildSpawnPad();
	}

	/**
	 * A single slab centred on the origin, positioned so its *top* face is at
	 * y = 0. Everything else in the game can then treat 0 as ground level.
	 */
	private buildGround(): void {
		create("Part", {
			Name: "Ground",
			Size: new Vector3(World.groundSize, World.groundThickness, World.groundSize),
			Position: new Vector3(0, -World.groundThickness / 2, 0),
			Anchored: true,
			Material: Enum.Material.Grass,
			Color: GROUND_COLOR,
			TopSurface: Enum.SurfaceType.Smooth,
			BottomSurface: Enum.SurfaceType.Smooth,
			Parent: Workspace,
		});
	}

	/**
	 * Without a SpawnLocation, Roblox drops characters at the origin in mid-air.
	 * Neutral so it doesn't quietly assign teams we don't have.
	 */
	private buildSpawnPad(): void {
		create("SpawnLocation", {
			Name: "SpawnPad",
			Size: new Vector3(World.spawnPadSize, 1, World.spawnPadSize),
			Position: new Vector3(0, 0.5, 0),
			Anchored: true,
			Neutral: true,
			Material: Enum.Material.Sand,
			Color: SPAWN_PAD_COLOR,
			TopSurface: Enum.SurfaceType.Smooth,
			BottomSurface: Enum.SurfaceType.Smooth,
			Parent: Workspace,
		});
	}
}
