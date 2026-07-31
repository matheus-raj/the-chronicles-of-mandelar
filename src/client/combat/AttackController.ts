/**
 * Turns weapon swings into server attack requests, with local feel.
 *
 * Weapons are Tools, so input comes from Tool.Activated — which fires on
 * mouse click and on touch tap alike, giving mobile support the old raw
 * MouseButton1 listener never had. Every activation plays the slash animation
 * and whoosh locally (a whiff should still feel like a swing); the server is
 * only asked to resolve damage when the cursor is actually over an enemy.
 *
 * The animation is Roblox's own Animate-script slash, picked by rig type —
 * engine-owned asset IDs, nothing uploaded.
 */

import { Players } from "@rbxts/services";
import { Remotes } from "shared/remotes";
import { create } from "shared/create";

const attackEnemy = Remotes.Client.Get("AttackEnemy");

const SLASH_ANIMATION_R15 = "rbxassetid://522635514";
const SLASH_ANIMATION_R6 = "rbxassetid://129967390";

export class AttackController {
	private readonly player = Players.LocalPlayer;
	private readonly mouse = Players.LocalPlayer.GetMouse();
	private readonly hooked = new Set<Tool>();
	private slashTrack?: AnimationTrack;

	public start(): void {
		// Weapons live in the Backpack when holstered and in the character
		// when equipped — and both containers are replaced on respawn, so
		// watch for new ones rather than holding references.
		this.player.ChildAdded.Connect((child) => {
			if (child.IsA("Backpack")) this.watch(child);
		});
		const backpack = this.player.FindFirstChildOfClass("Backpack");
		if (backpack !== undefined) this.watch(backpack);

		this.player.CharacterAdded.Connect((character) => {
			this.slashTrack = undefined; // new character, new Animator
			this.watch(character);
		});
		if (this.player.Character !== undefined) this.watch(this.player.Character);
	}

	private watch(container: Instance): void {
		container.ChildAdded.Connect((child) => this.hookIfWeapon(child));
		for (const child of container.GetChildren()) {
			this.hookIfWeapon(child);
		}
	}

	private hookIfWeapon(child: Instance): void {
		if (!child.IsA("Tool")) return;
		if (child.GetAttribute("WeaponId") === undefined) return;
		if (this.hooked.has(child)) return;

		this.hooked.add(child);
		child.Activated.Connect(() => this.swing(child));
	}

	private swing(tool: Tool): void {
		this.playSlash();
		this.playWhoosh(tool);

		const target = this.mouse.Target;
		if (target === undefined) return;

		const enemyModel = this.findEnemyModel(target);
		if (enemyModel === undefined) return;

		attackEnemy.SendToServer(enemyModel);
	}

	private playSlash(): void {
		const track = this.slashTrack ?? this.loadSlash();
		track?.Play(0.05);
	}

	private loadSlash(): AnimationTrack | undefined {
		const character = this.player.Character;
		const humanoid = character?.FindFirstChildOfClass("Humanoid");
		const animator = humanoid?.FindFirstChildOfClass("Animator");
		if (humanoid === undefined || animator === undefined) return undefined;

		const animation = create("Animation", {
			AnimationId: humanoid.RigType === Enum.HumanoidRigType.R6 ? SLASH_ANIMATION_R6 : SLASH_ANIMATION_R15,
		});
		this.slashTrack = animator.LoadAnimation(animation);
		this.slashTrack.Priority = Enum.AnimationPriority.Action;
		return this.slashTrack;
	}

	private playWhoosh(tool: Tool): void {
		const handle = tool.FindFirstChild("Handle");
		if (handle === undefined || !handle.IsA("BasePart")) return;

		const sound = create("Sound", {
			SoundId: "rbxasset://sounds/swordslash.wav",
			Volume: 0.4,
			Parent: handle,
		});
		sound.Play();
		task.delay(2, () => sound.Destroy());
	}

	private findEnemyModel(part: BasePart): Model | undefined {
		let current: Instance | undefined = part;
		while (current !== undefined) {
			if (current.IsA("Model") && current.GetAttribute("IsEnemy") === true) {
				return current;
			}
			current = current.Parent;
		}
		return undefined;
	}
}
