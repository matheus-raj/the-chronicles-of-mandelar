/**
 * Spawns, tracks, and drives code-built enemies — ghouls and robots.
 *
 * Every enemy carries three attributes: `IsEnemy`, which is what the client's
 * AttackController looks for (so it stays type-agnostic); `EnemyKind`, which
 * names the type; and `Origin`, its post, which the spawn tests use to assert
 * a wandering enemy hasn't drifted beyond its radius.
 *
 * Behaviour is decided by EnemyBrain (a pure state machine — see its header
 * for why) and applied here each Heartbeat. Enemies stay anchored and move by
 * PivotTo: unanchored parts near a player get physics-simulated on that
 * player's client (network ownership), which is both jittery and an exploit
 * surface. Anchored + CFrame keeps the server authoritative, same stance as
 * CombatService takes for player attacks.
 */

import { Players, RunService, Workspace } from "@rbxts/services";
import { EnemyKindId, EnemyKinds, EnemySpawns } from "shared/config/game";
import { create } from "shared/create";
import { BrainState, decide, flatDistance, initialState } from "server/combat/EnemyBrain";

export interface EnemyHandle {
	readonly model: Model;
	readonly kind: EnemyKindId;
	/** Ground position this enemy belongs to, and returns to when it respawns. */
	readonly origin: Vector3;
	health: number;
	brain: BrainState;
}

/** Cap a single step's dt so a lag spike can't teleport an enemy. */
const MAX_STEP_SECONDS = 0.1;

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

		RunService.Heartbeat.Connect((dt) => this.step(math.min(dt, MAX_STEP_SECONDS)));
	}

	/** One decision-and-apply pass over every living enemy. */
	private step(dt: number): void {
		for (const [model, handle] of this.enemies) {
			// The model can vanish out from under us (test teardown, an
			// explicit Destroy in Studio). Drop the handle instead of erroring
			// every frame forever.
			if (model.Parent === undefined) {
				this.enemies.delete(model);
				continue;
			}

			const body = model.PrimaryPart;
			if (body === undefined) continue;

			// The brain thinks in ground (feet) positions.
			const feet = body.Position.sub(new Vector3(0, body.Size.Y / 2, 0));
			const target = this.nearestLivingPlayer(feet);
			const decision = decide(handle.brain, {
				dt,
				position: feet,
				origin: handle.origin,
				nearestPlayer: target?.groundPosition,
				kind: EnemyKinds[handle.kind],
				rng: () => math.random(),
			});
			handle.brain = decision.state;

			if (decision.healToFull) {
				handle.health = EnemyKinds[handle.kind].maxHealth;
				this.updateHealthLabel(handle);
			}

			if (decision.moveToward !== undefined) {
				this.stepToward(handle, body, feet, decision.moveToward, decision.speedScale, dt);
			}

			if (decision.swing && target !== undefined) {
				target.humanoid.TakeDamage(EnemyKinds[handle.kind].attackDamage);
			}
		}
	}

	/**
	 * The living player nearest to *this* enemy, as the brain wants to see one:
	 * a ground position plus the humanoid to swing at. Per-enemy on purpose —
	 * with several players online, each enemy fights its own closest one. Dead
	 * and still-loading characters don't count; an enemy never chases a corpse.
	 */
	private nearestLivingPlayer(feet: Vector3): { groundPosition: Vector3; humanoid: Humanoid } | undefined {
		let best: { groundPosition: Vector3; humanoid: Humanoid } | undefined;
		let bestDistance = math.huge;

		for (const player of Players.GetPlayers()) {
			const character = player.Character;
			const root = character?.FindFirstChild("HumanoidRootPart") as BasePart | undefined;
			const humanoid = character?.FindFirstChildOfClass("Humanoid");
			if (root === undefined || humanoid === undefined || humanoid.Health <= 0) continue;

			const groundPosition = new Vector3(root.Position.X, 0, root.Position.Z);
			const distance = flatDistance(feet, groundPosition);
			if (distance < bestDistance) {
				bestDistance = distance;
				best = { groundPosition, humanoid };
			}
		}

		return best;
	}

	/** Advance the body toward a ground goal, clamped so it never overshoots. */
	private stepToward(
		handle: EnemyHandle,
		body: BasePart,
		feet: Vector3,
		goal: Vector3,
		speedScale: number,
		dt: number,
	): void {
		const flatGoal = new Vector3(goal.X, feet.Y, goal.Z);
		const offset = flatGoal.sub(feet);
		if (offset.Magnitude < 0.001) return;

		const stepLength = math.min(EnemyKinds[handle.kind].moveSpeed * speedScale * dt, offset.Magnitude);
		const nextFeet = feet.add(offset.Unit.mul(stepLength));
		const centre = nextFeet.add(new Vector3(0, body.Size.Y / 2, 0));

		// Face travel, stay upright: the look target shares the centre's Y.
		const lookAt = new Vector3(flatGoal.X, centre.Y, flatGoal.Z);
		handle.model.PivotTo(CFrame.lookAt(centre, lookAt));
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

		// Capture kind and origin before destroying the model — the respawn
		// closure outlives the handle. Respawning at the stored origin rather
		// than at the model's pivot matters twice over: the enemy returns to its
		// post instead of wherever it happened to die, and the pivot is a body
		// centre while spawnAt expects a ground position, so feeding it back
		// would lift the enemy half its height further off the floor on every
		// death.
		const { kind, origin } = handle;
		this.despawn(handle);
		task.delay(EnemyKinds[kind].respawnDelay, () => this.spawnAt(kind, origin));
		return true;
	}

	/** `origin` is where the enemy's feet go; the body is lifted from there. */
	private spawnAt(kind: EnemyKindId, origin: Vector3): void {
		const stats = EnemyKinds[kind];
		const look = APPEARANCE[kind];
		const centre = origin.add(new Vector3(0, look.size.Y / 2, 0));

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
			Position: centre,
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
		model.SetAttribute("Origin", origin);
		model.Parent = this.folder;

		const handle: EnemyHandle = { model, kind, origin, health: stats.maxHealth, brain: initialState() };
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
