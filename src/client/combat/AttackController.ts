/**
 * Turns a left-click on an enemy into a server attack request.
 */

import { Players, UserInputService } from "@rbxts/services";
import { Remotes } from "shared/remotes";

const attackEnemy = Remotes.Client.Get("AttackEnemy");

export class AttackController {
	private readonly mouse = Players.LocalPlayer.GetMouse();

	public start(): void {
		UserInputService.InputBegan.Connect((input, gameProcessed) => {
			if (gameProcessed) return;
			if (input.UserInputType !== Enum.UserInputType.MouseButton1) return;
			this.tryAttack();
		});
	}

	private tryAttack(): void {
		const target = this.mouse.Target;
		if (target === undefined) return;

		const enemyModel = this.findEnemyModel(target);
		if (enemyModel === undefined) return;

		attackEnemy.SendToServer(enemyModel);
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
