/**
 * Small server-side combat effects: floating damage numbers, hit flashes,
 * impact sounds. Created on the server so every player sees the same fight.
 *
 * Sounds use rbxasset:// built-ins (shipped with the engine) rather than
 * catalog asset IDs — nothing to moderate, nothing to fail loading offline.
 */

import { Debris, TweenService, Workspace } from "@rbxts/services";
import { create } from "shared/create";

const NUMBER_LIFETIME = 0.8;
const NUMBER_RISE_STUDS = 3;
const FLASH_SECONDS = 0.12;

/** A floating number that rises and fades — the classic "you did damage" cue. */
export function damageNumber(position: Vector3, amount: number, color: Color3): void {
	const label = create("TextLabel", {
		Size: UDim2.fromScale(1, 1),
		BackgroundTransparency: 1,
		Text: tostring(math.floor(amount)),
		TextColor3: color,
		TextStrokeTransparency: 0.2,
		TextScaled: true,
		Font: Enum.Font.GothamBold,
	});

	const gui = create("BillboardGui", {
		Size: UDim2.fromOffset(60, 28),
		StudsOffsetWorldSpace: new Vector3(0, 0, 0),
		AlwaysOnTop: true,
		Children: [label],
	});

	// An invisible anchored anchor part; the number can't be parented to the
	// target, or it would vanish the instant the target despawns.
	const anchor = create("Part", {
		Name: "DamageNumber",
		Size: new Vector3(0.2, 0.2, 0.2),
		Position: position,
		Transparency: 1,
		Anchored: true,
		CanCollide: false,
		CanQuery: false,
		CanTouch: false,
		Children: [gui],
		Parent: Workspace,
	});

	const drift = TweenService.Create(
		gui,
		new TweenInfo(NUMBER_LIFETIME, Enum.EasingStyle.Quad, Enum.EasingDirection.Out),
		{
			StudsOffsetWorldSpace: new Vector3(0, NUMBER_RISE_STUDS, 0),
		},
	);
	const fade = TweenService.Create(
		label,
		new TweenInfo(NUMBER_LIFETIME, Enum.EasingStyle.Quad, Enum.EasingDirection.In),
		{
			TextTransparency: 1,
			TextStrokeTransparency: 1,
		},
	);
	drift.Play();
	fade.Play();
	Debris.AddItem(anchor, NUMBER_LIFETIME + 0.1);
}

/**
 * Flash a part a colour, then restore. The restore colour is explicit rather
 * than read from the part, so overlapping flashes from rapid hits can't
 * "restore" to a mid-flash colour and leave the part stuck white.
 */
export function flash(part: BasePart, flashColor: Color3, restoreColor: Color3): void {
	part.Color = flashColor;
	task.delay(FLASH_SECONDS, () => {
		if (part.Parent !== undefined) part.Color = restoreColor;
	});
}

/** Play a built-in sound at a part and clean it up after. */
export function impactSound(parent: BasePart, soundFile: string, volume: number): void {
	const sound = create("Sound", {
		SoundId: `rbxasset://sounds/${soundFile}`,
		Volume: volume,
		Parent: parent,
	});
	sound.Play();
	Debris.AddItem(sound, 2);
}

/**
 * Fade a model out instead of blinking it away — a defeated enemy should
 * visibly fall, not vanish between frames. GUIs are destroyed immediately so
 * no health label lingers over a ghost.
 */
export function fadeOut(model: Model, seconds: number): void {
	for (const descendant of model.GetDescendants()) {
		if (descendant.IsA("BillboardGui")) {
			descendant.Destroy();
		} else if (descendant.IsA("BasePart")) {
			descendant.CanCollide = false;
			TweenService.Create(descendant, new TweenInfo(seconds, Enum.EasingStyle.Quad, Enum.EasingDirection.In), {
				Transparency: 1,
			}).Play();
		}
	}
	Debris.AddItem(model, seconds + 0.05);
}
