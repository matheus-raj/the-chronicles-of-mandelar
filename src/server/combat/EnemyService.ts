/**
 * Spawns and tracks code-built enemies — ghouls and robots.
 *
 * Every enemy carries two attributes: `IsEnemy`, which is what the client's
 * AttackController looks for (so it stays type-agnostic), and `EnemyKind`,
 * which names the type for anything that needs to tell them apart.
 */

import { Workspace } from "@rbxts/services";
import { EnemyKindId, EnemyKinds, EnemySpawns } from "shared/config/game";
import { create } from "shared/create";

export interface EnemyHandle {
	readonly model: Model;
	readonly kind: EnemyKindId;
	health: number;
}

/**
 * How each type looks. Kept here rather than in shared config: the numbers that
 * decide a fight belong in config, a shade of grey doesn't.
 */
const APPEARANCE: { readonly [K in EnemyKindId]: { readonly color: Color3; readonly size: Vector3 } } = {
	// Sickly green, and the smaller silhouette of the two.
	Ghoul: { color: Color3.fromRGB(120, 150, 90), size: new Vector3(3, 5, 3) },
	// Cold gunmetal, bulkier — reads as the heavier threat at a glance.
	Robot: { color: Color3.fromRGB(150, 155, 170), size: new Vector3(3.5, 5.5, 3.5) },
};

export class EnemyService {
	private readonly enemies = new Map<Model, EnemyHandle>();
	private folder!: Folder;

	public start(): void {
		this.folder = create("Folder", { Name: "Enemies", Parent: Workspace });

		for (const spawn of EnemySpawns) {
			this.spawnAt(spawn.kind, spawn.position);
		}
	}

	public getHandle(model: Model): EnemyHandle | undefined {
		return this.enemies.get(model);
	}

	public isEnemy(model: Model): boolean {
		return this.enemies.has(model);
	}

	/**
	 * Apply damage to an enemy. Returns `true` if this hit defeated it, in which
	 * case the caller should award XP; it then respawns after its type's delay.
	 */
	public applyDamage(handle: EnemyHandle, amount: number): boolean {
		handle.health = math.max(0, handle.health - amount);
		this.updateHealthLabel(handle);

		if (handle.health > 0) return false;

		// Capture kind and position before destroying the model — the respawn
		// closure outlives the handle. Note this respawns where it died rather
		// than at its original post, which is identical today because nothing
		// moves; revisit if enemies ever get movement.
		const { kind } = handle;
		const position = handle.model.GetPivot().Position;
		this.despawn(handle);
		task.delay(EnemyKinds[kind].respawnDelay, () => this.spawnAt(kind, position));
		return true;
	}

	private spawnAt(kind: EnemyKindId, position: Vector3): void {
		const stats = EnemyKinds[kind];
		const look = APPEARANCE[kind];

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
			Size: look.size,
			Color: look.color,
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
			Name: stats.displayName,
			Children: [body],
		});
		model.PrimaryPart = body;
		model.SetAttribute("IsEnemy", true);
		model.SetAttribute("EnemyKind", kind);
		model.Parent = this.folder;

		const handle: EnemyHandle = { model, kind, health: stats.maxHealth };
		this.enemies.set(model, handle);
		this.setLabelText(label, handle);
	}

	private despawn(handle: EnemyHandle): void {
		this.enemies.delete(handle.model);
		handle.model.Destroy();
	}

	private updateHealthLabel(handle: EnemyHandle): void {
		const body = handle.model.PrimaryPart;
		const label = body?.FindFirstChild("HealthGui")?.FindFirstChild("HealthLabel") as TextLabel | undefined;
		if (label !== undefined) this.setLabelText(label, handle);
	}

	private setLabelText(label: TextLabel, handle: EnemyHandle): void {
		label.Text = `HP ${handle.health}/${EnemyKinds[handle.kind].maxHealth}`;
	}
}
