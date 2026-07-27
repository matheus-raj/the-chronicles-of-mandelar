/**
 * Client entry point.
 * Files ending in `.client.ts` compile to LocalScripts that run on each player.
 */

import { Players } from "@rbxts/services";
import { GAME_NAME } from "shared/greeting";

const localPlayer = Players.LocalPlayer;

print(`${GAME_NAME} loaded for ${localPlayer.Name}`);
