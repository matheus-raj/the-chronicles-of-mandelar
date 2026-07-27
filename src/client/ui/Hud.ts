/**
 * Builds the on-screen HUD (level, XP bar, health bar, toast messages) purely
 * from code and keeps it in sync with stats replicated from the server.
 */

import { Players } from "@rbxts/services";
import { Remotes } from "shared/remotes";
import { GAME_NAME } from "shared/greeting";
import { PlayerStats } from "shared/types";

const ACCENT = Color3.fromRGB(90, 170, 255);
const XP_FILL = Color3.fromRGB(120, 200, 120);
const HEALTH_FILL = Color3.fromRGB(220, 80, 80);
const PANEL_BG = Color3.fromRGB(20, 22, 28);

export class Hud {
	private levelLabel!: TextLabel;
	private xpFill!: Frame;
	private xpText!: TextLabel;
	private healthFill!: Frame;
	private healthText!: TextLabel;
	private toast!: TextLabel;

	public start(): void {
		this.build();
		Remotes.Client.Get("SyncStats").Connect((stats) => this.render(stats));
		Remotes.Client.Get("Notify").Connect((message) => this.showToast(message));
	}

	private render(stats: PlayerStats): void {
		this.levelLabel.Text = `Level ${stats.level}`;
		this.xpText.Text = `${stats.xp} / ${stats.xpToNext} XP`;
		this.xpFill.Size = UDim2.fromScale(math.clamp(stats.xp / stats.xpToNext, 0, 1), 1);

		this.healthText.Text = `${math.floor(stats.health)} / ${stats.maxHealth} HP`;
		this.healthFill.Size = UDim2.fromScale(math.clamp(stats.health / stats.maxHealth, 0, 1), 1);
	}

	private showToast(message: string): void {
		this.toast.Text = message;
		this.toast.TextTransparency = 0;
		const shownFor = os.clock();
		task.delay(2.5, () => {
			// Only clear if no newer toast arrived in the meantime.
			if (os.clock() - shownFor >= 2.5) this.toast.TextTransparency = 1;
		});
	}

	private build(): void {
		const playerGui = Players.LocalPlayer.WaitForChild("PlayerGui");

		const screen = new Instance("ScreenGui");
		screen.Name = "HUD";
		screen.ResetOnSpawn = false;
		screen.IgnoreGuiInset = true;
		screen.Parent = playerGui;

		const panel = new Instance("Frame");
		panel.Name = "StatsPanel";
		panel.AnchorPoint = new Vector2(0, 1);
		panel.Position = new UDim2(0, 16, 1, -16);
		panel.Size = UDim2.fromOffset(260, 96);
		panel.BackgroundColor3 = PANEL_BG;
		panel.BackgroundTransparency = 0.2;
		panel.Parent = screen;
		this.corner(panel, 8);

		this.levelLabel = this.label(panel, `Level 1`, new UDim2(0, 12, 0, 8), UDim2.fromOffset(236, 22), 18);
		this.levelLabel.TextColor3 = ACCENT;
		this.levelLabel.TextXAlignment = Enum.TextXAlignment.Left;

		const [xpBar, xpFill, xpText] = this.bar(panel, new UDim2(0, 12, 0, 38), XP_FILL);
		this.xpFill = xpFill;
		this.xpText = xpText;
		xpBar.Name = "XpBar";

		const [healthBar, healthFill, healthText] = this.bar(panel, new UDim2(0, 12, 0, 64), HEALTH_FILL);
		this.healthFill = healthFill;
		this.healthText = healthText;
		healthBar.Name = "HealthBar";

		this.toast = this.label(screen, "", new UDim2(0.5, -200, 0.18, 0), UDim2.fromOffset(400, 40), 24);
		this.toast.AnchorPoint = new Vector2(0, 0);
		this.toast.TextColor3 = Color3.fromRGB(255, 230, 120);
		this.toast.TextTransparency = 1;

		this.render({ level: 1, xp: 0, xpToNext: 100, health: 100, maxHealth: 100 });
		print(`[${GAME_NAME}] HUD ready.`);
	}

	private bar(parent: Instance, position: UDim2, fillColor: Color3): [Frame, Frame, TextLabel] {
		const bar = new Instance("Frame");
		bar.Position = position;
		bar.Size = UDim2.fromOffset(236, 20);
		bar.BackgroundColor3 = Color3.fromRGB(45, 48, 56);
		bar.Parent = parent;
		this.corner(bar, 6);

		const fill = new Instance("Frame");
		fill.Name = "Fill";
		fill.Size = UDim2.fromScale(0, 1);
		fill.BackgroundColor3 = fillColor;
		fill.BorderSizePixel = 0;
		fill.Parent = bar;
		this.corner(fill, 6);

		const text = new Instance("TextLabel");
		text.Name = "Text";
		text.Size = UDim2.fromScale(1, 1);
		text.BackgroundTransparency = 1;
		text.TextColor3 = Color3.fromRGB(255, 255, 255);
		text.TextStrokeTransparency = 0.5;
		text.TextScaled = true;
		text.Font = Enum.Font.GothamMedium;
		text.Parent = bar;

		return [bar, fill, text];
	}

	private label(parent: Instance, text: string, position: UDim2, size: UDim2, textSize: number): TextLabel {
		const label = new Instance("TextLabel");
		label.Text = text;
		label.Position = position;
		label.Size = size;
		label.BackgroundTransparency = 1;
		label.TextColor3 = Color3.fromRGB(255, 255, 255);
		label.TextStrokeTransparency = 0.5;
		label.TextSize = textSize;
		label.Font = Enum.Font.GothamBold;
		label.Parent = parent;
		return label;
	}

	private corner(instance: Instance, radius: number): void {
		const corner = new Instance("UICorner");
		corner.CornerRadius = new UDim(0, radius);
		corner.Parent = instance;
	}
}
