/**
 * Spawns and tracks "training dummy" enemies entirely from code, so no manual
 * model-building is needed in Studio. Each dummy is a simple part with a
 * floating health billboard and an `IsEnemy` attribute the client looks for.
 */

import { Workspace } from "@rbxts/services";
import { Enemies } from "shared/config/game";
import { create } from "shared/create";

export interface EnemyHandle {
	readonly model: Model;
	health: number;
}

/** Fixed spots (relative to the world origin) where dummies stand. */
const SPAWN_POSITIONS: Vector3[] = [new Vector3(0, 5, -20), new Vector3(10, 5, -24), new Vector3(-10, 5, -24)];

export class EnemyService {
	private readonly enemies = new Map<Model, EnemyHandle>();
	private folder!: Folder;

	public start(): void {
		this.folder = create("Folder", { Name: "Enemies", Parent: Workspace });

		for (const position of SPAWN_POSITIONS) {
			this.spawnAt(position);
		}
	}

	public getHandle(model: Model): EnemyHandle | undefined {
		return this.enemies.get(model);
	}

	public isEnemy(model: Model): boolean {
		return this.enemies.has(model);
	}

	/**
	 * Apply damage to a dummy. Returns `true` if this hit defeated it, in which
	 * case the caller should award XP; the dummy then respawns after a delay.
	 */
	public applyDamage(handle: EnemyHandle, amount: number): boolean {
		handle.health = math.max(0, handle.health - amount);
		this.updateHealthLabel(handle);

		if (handle.health > 0) return false;

		// Capture the spawn position before destroying the model.
		const position = handle.model.GetPivot().Position;
		this.despawn(handle);
		task.delay(Enemies.respawnDelay, () => this.spawnAt(position));
		return true;
	}

	private spawnAt(position: Vector3): void {
		const label = create("TextLabel", {
			Name: "HealthLabel",
			Size: UDim2.fromScale(1, 1),
			BackgroundTransparency: 1,
			TextColor3: Color3.fromRGB(255, 255, 255),
			TextStrokeTransparency: 0.4,
			TextScaled: true,
			Font: Enum.Font.GothamBold,
		});

		const body = create("Part", {
			Name: "Body",
			Size: new Vector3(3, 5, 3),
			Color: Color3.fromRGB(180, 60, 60),
			Anchored: true,
			Position: position,
			Children: [
				create("BillboardGui", {
					Name: "HealthGui",
					Size: UDim2.fromOffset(120, 30),
					StudsOffsetWorldSpace: new Vector3(0, 4, 0),
					AlwaysOnTop: true,
					Children: [label],
				}),
			],
		});

		const model = create("Model", {
			Name: "TrainingDummy",
			Children: [body],
		});
		model.PrimaryPart = body;
		model.SetAttribute("IsEnemy", true);
		model.Parent = this.folder;

		const handle: EnemyHandle = { model, health: Enemies.maxHealth };
		this.enemies.set(model, handle);
		this.setLabelText(label, handle.health);
	}

	private despawn(handle: EnemyHandle): void {
		this.enemies.delete(handle.model);
		handle.model.Destroy();
	}

	private updateHealthLabel(handle: EnemyHandle): void {
		const body = handle.model.PrimaryPart;
		const label = body?.FindFirstChild("HealthGui")?.FindFirstChild("HealthLabel") as TextLabel | undefined;
		if (label !== undefined) this.setLabelText(label, handle.health);
	}

	private setLabelText(label: TextLabel, health: number): void {
		label.Text = `HP ${health}/${Enemies.maxHealth}`;
	}
}
