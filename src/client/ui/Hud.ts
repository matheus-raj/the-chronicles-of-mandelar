/**
 * Builds the HUD (level, XP bar, health bar, toasts) and keeps it in
 * sync with stats replicated from the server.
 */

import { Players } from "@rbxts/services";
import { Remotes } from "shared/remotes";
import { GAME_NAME } from "shared/greeting";
import { PlayerStats } from "shared/types";
import { create, InstanceProps } from "shared/create";

const ACCENT = Color3.fromRGB(90, 170, 255);
const XP_FILL = Color3.fromRGB(120, 200, 120);
const HEALTH_FILL = Color3.fromRGB(220, 80, 80);
const PANEL_BG = Color3.fromRGB(20, 22, 28);
const WHITE = Color3.fromRGB(255, 255, 255);

interface Bar {
	frame: Frame;
	fill: Frame;
	text: TextLabel;
}

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

		this.levelLabel = this.label({
			Text: "Level 1",
			Position: new UDim2(0, 12, 0, 8),
			Size: UDim2.fromOffset(236, 22),
			TextSize: 18,
			TextColor3: ACCENT,
			TextXAlignment: Enum.TextXAlignment.Left,
		});

		const xp = this.bar("XpBar", new UDim2(0, 12, 0, 38), XP_FILL);
		this.xpFill = xp.fill;
		this.xpText = xp.text;

		const health = this.bar("HealthBar", new UDim2(0, 12, 0, 64), HEALTH_FILL);
		this.healthFill = health.fill;
		this.healthText = health.text;

		this.toast = this.label({
			Text: "",
			Position: new UDim2(0.5, -200, 0.18, 0),
			Size: UDim2.fromOffset(400, 40),
			TextSize: 24,
			TextColor3: Color3.fromRGB(255, 230, 120),
			TextTransparency: 1,
		});

		create("ScreenGui", {
			Name: "HUD",
			ResetOnSpawn: false,
			IgnoreGuiInset: true,
			Children: [
				create("Frame", {
					Name: "StatsPanel",
					AnchorPoint: new Vector2(0, 1),
					Position: new UDim2(0, 16, 1, -16),
					Size: UDim2.fromOffset(260, 96),
					BackgroundColor3: PANEL_BG,
					BackgroundTransparency: 0.2,
					Children: [this.corner(8), this.levelLabel, xp.frame, health.frame],
				}),
				this.toast,
			],
			Parent: playerGui,
		});

		this.render({ level: 1, xp: 0, xpToNext: 100, health: 100, maxHealth: 100 });
		print(`[${GAME_NAME}] HUD ready.`);
	}

	private bar(name: string, position: UDim2, fillColor: Color3): Bar {
		const fill = create("Frame", {
			Name: "Fill",
			Size: UDim2.fromScale(0, 1),
			BackgroundColor3: fillColor,
			BorderSizePixel: 0,
			Children: [this.corner(6)],
		});

		const text = create("TextLabel", {
			Name: "Text",
			Size: UDim2.fromScale(1, 1),
			BackgroundTransparency: 1,
			TextColor3: WHITE,
			TextStrokeTransparency: 0.5,
			TextScaled: true,
			Font: Enum.Font.GothamMedium,
		});

		const frame = create("Frame", {
			Name: name,
			Position: position,
			Size: UDim2.fromOffset(236, 20),
			BackgroundColor3: Color3.fromRGB(45, 48, 56),
			Children: [this.corner(6), fill, text],
		});

		return { frame, fill, text };
	}

	private label(props: InstanceProps<TextLabel>): TextLabel {
		return create("TextLabel", {
			BackgroundTransparency: 1,
			TextColor3: WHITE,
			TextStrokeTransparency: 0.5,
			Font: Enum.Font.GothamBold,
			...props,
		});
	}

	private corner(radius: number): UICorner {
		return create("UICorner", { CornerRadius: new UDim(0, radius) });
	}
}
