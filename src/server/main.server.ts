/**
 * Server entry point.
 * Files ending in `.server.ts` compile to Scripts that run on the server.
 */

import { Players } from "@rbxts/services";
import { makeGreeting } from "shared/greeting";

Players.PlayerAdded.Connect((player) => {
	print(makeGreeting(player.Name));
});
