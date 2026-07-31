/**
 * The enemy decision core: a pure state machine.
 *
 * Deliberately free of Roblox instances — it sees positions and numbers, and
 * returns a state plus intents (where to move, whether to swing, whether to
 * heal). EnemyService owns the world: it finds targets, feeds the brain each
 * Heartbeat, and applies what comes back. The split exists for testability:
 * every transition here is exercised headlessly by tests/ai.spec.luau with
 * synthetic positions, an injected RNG, and no players — behaviour bugs are
 * exactly the kind the test suite has historically been blind to.
 *
 * All distances are XZ-only: the world is flat and character roots float above
 * the ground, so 3D distance would quietly shrink every range.
 *
 * States:
 *   Idle    — standing at ease near its post, waiting out a pause timer
 *   Wander  — ambling (at half speed) to a random point near its post
 *   Chase   — a player got too close; run them down
 *   Attack  — in range; swing every attackInterval seconds
 *   Return  — target gone or leash broken; walk home, hostile to no one
 */

import { EnemyKind } from "shared/config/game";

export type BrainState =
	| { readonly mode: "Idle"; readonly pauseRemaining: number }
	| { readonly mode: "Wander"; readonly goal: Vector3 }
	| { readonly mode: "Chase" }
	| { readonly mode: "Attack"; readonly cooldownRemaining: number }
	| { readonly mode: "Return" };

export interface BrainInput {
	/** Seconds since the last decision. */
	readonly dt: number;
	/** The enemy's current ground (feet) position. */
	readonly position: Vector3;
	/** The post it spawned at and returns to. */
	readonly origin: Vector3;
	/** Ground position of the nearest living player, if any exist at all. */
	readonly nearestPlayer?: Vector3;
	readonly kind: EnemyKind;
	/** Uniform random in [0, 1). Injected so tests can be deterministic. */
	readonly rng: () => number;
}

export interface BrainOutput {
	readonly state: BrainState;
	/** Ground position to step toward this frame, if any. */
	readonly moveToward?: Vector3;
	/** Fraction of kind.moveSpeed to move at (wandering ambles at half). */
	readonly speedScale: number;
	/** True exactly on frames where a swing lands (range is already checked). */
	readonly swing: boolean;
	/** True once, when the leash breaks: restore the enemy to full health. */
	readonly healToFull: boolean;
}

const WANDER_SPEED_SCALE = 0.5;
/** Idle pause between ambles: 2..6 seconds. */
const PAUSE_MIN = 2;
const PAUSE_SPAN = 4;
/** Close enough to a goal to count as arrived (studs). */
const ARRIVE_EPSILON = 0.5;

export function flatDistance(a: Vector3, b: Vector3): number {
	const dx = a.X - b.X;
	const dz = a.Z - b.Z;
	return math.sqrt(dx * dx + dz * dz);
}

export function initialState(): BrainState {
	return { mode: "Idle", pauseRemaining: 0 };
}

function output(state: BrainState, extra?: Partial<BrainOutput>): BrainOutput {
	return {
		state,
		speedScale: 1,
		swing: false,
		healToFull: false,
		...extra,
	};
}

function pickWanderGoal(origin: Vector3, radius: number, rng: () => number): Vector3 {
	const angle = rng() * 2 * math.pi;
	// sqrt keeps picks uniform over the disc rather than clumped at the centre.
	const distance = math.sqrt(rng()) * radius;
	return new Vector3(origin.X + math.cos(angle) * distance, origin.Y, origin.Z + math.sin(angle) * distance);
}

export function decide(state: BrainState, input: BrainInput): BrainOutput {
	const { kind, position, origin, nearestPlayer, dt, rng } = input;

	const playerDistance = nearestPlayer !== undefined ? flatDistance(position, nearestPlayer) : math.huge;
	const homeDistance = flatDistance(position, origin);

	// Hostility comes first in every state except Return: anything inside
	// aggroRange gets charged, mid-pause or mid-amble alike.
	const provoked = nearestPlayer !== undefined && playerDistance <= kind.aggroRange;

	if (state.mode === "Return") {
		if (homeDistance <= ARRIVE_EPSILON) {
			return output({ mode: "Idle", pauseRemaining: PAUSE_MIN + rng() * PAUSE_SPAN });
		}
		return output(state, { moveToward: origin });
	}

	if (state.mode === "Chase" || state.mode === "Attack") {
		// Once a fight starts, aggroRange no longer matters — stepping just
		// outside it must not reset the enemy, or players farm it risk-free by
		// dancing on the edge. A fight ends two ways only: the enemy is dragged
		// past its leash, or there is no living player left to hit. Both are an
		// evade: heal to full and walk home, hostile to no one.
		if (nearestPlayer === undefined || homeDistance > kind.leashRange) {
			return output({ mode: "Return" }, { healToFull: true });
		}

		if (playerDistance > kind.attackRange) {
			return output({ mode: "Chase" }, { moveToward: nearestPlayer });
		}

		// In range: swing when the cooldown says so.
		const cooldown = state.mode === "Attack" ? state.cooldownRemaining - dt : 0;
		if (cooldown <= 0) {
			return output({ mode: "Attack", cooldownRemaining: kind.attackInterval }, { swing: true });
		}
		return output({ mode: "Attack", cooldownRemaining: cooldown });
	}

	// Idle / Wander.
	if (provoked) {
		return output({ mode: "Chase" }, { moveToward: nearestPlayer });
	}

	if (state.mode === "Wander") {
		if (flatDistance(position, state.goal) <= ARRIVE_EPSILON) {
			return output({ mode: "Idle", pauseRemaining: PAUSE_MIN + rng() * PAUSE_SPAN });
		}
		return output(state, { moveToward: state.goal, speedScale: WANDER_SPEED_SCALE });
	}

	const pauseRemaining = state.pauseRemaining - dt;
	if (pauseRemaining <= 0) {
		const goal = pickWanderGoal(origin, kind.wanderRadius, rng);
		return output({ mode: "Wander", goal }, { moveToward: goal, speedScale: WANDER_SPEED_SCALE });
	}
	return output({ mode: "Idle", pauseRemaining });
}
