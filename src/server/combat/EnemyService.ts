/**
 * Spawns and tracks "training dummy" enemies entirely from code, so no manual
 * model-building is needed in Studio. Each dummy is a simple part with a
 * floating health billboard and an `IsEnemy` attribute the client looks for.
 */

import { Workspace } from "@rbxts/services";
import { Enemies } from "shared/config/game";

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
		this.folder = new Instance("Folder");
		this.folder.Name = "Enemies";
		this.folder.Parent = Workspace;

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
		const model = new Instance("Model");
		model.Name = "TrainingDummy";
		model.SetAttribute("IsEnemy", true);

		const body = new Instance("Part");
		body.Name = "Body";
		body.Size = new Vector3(3, 5, 3);
		body.Color = Color3.fromRGB(180, 60, 60);
		body.Anchored = true;
		body.Position = position;
		body.Parent = model;
		model.PrimaryPart = body;

		const label = this.buildHealthLabel(body);

		model.Parent = this.folder;

		const handle: EnemyHandle = { model, health: Enemies.maxHealth };
		this.enemies.set(model, handle);
		this.setLabelText(label, handle.health);
	}

	private despawn(handle: EnemyHandle): void {
		this.enemies.delete(handle.model);
		handle.model.Destroy();
	}

	private buildHealthLabel(body: Part): TextLabel {
		const billboard = new Instance("BillboardGui");
		billboard.Name = "HealthGui";
		billboard.Size = UDim2.fromOffset(120, 30);
		billboard.StudsOffsetWorldSpace = new Vector3(0, 4, 0);
		billboard.AlwaysOnTop = true;
		billboard.Parent = body;

		const label = new Instance("TextLabel");
		label.Name = "HealthLabel";
		label.Size = UDim2.fromScale(1, 1);
		label.BackgroundTransparency = 1;
		label.TextColor3 = Color3.fromRGB(255, 255, 255);
		label.TextStrokeTransparency = 0.4;
		label.TextScaled = true;
		label.Font = Enum.Font.GothamBold;
		label.Parent = billboard;

		return label;
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
