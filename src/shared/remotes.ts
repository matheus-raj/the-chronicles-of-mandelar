/**
 * Type-safe networking definitions (RbxNet). Both the server and client import
 * this same object; RbxNet generates the underlying RemoteEvents automatically.
 */

import Net from "@rbxts/net";
import { PlayerStats } from "shared/types";

export const Remotes = Net.Definitions.Create({
	/** Client asks the server to attack the enemy model it clicked. */
	AttackEnemy: Net.Definitions.ClientToServerEvent<[target: Instance]>(),

	/** Server pushes a fresh stats snapshot to a player's HUD. */
	SyncStats: Net.Definitions.ServerToClientEvent<[stats: PlayerStats]>(),

	/** Server sends a transient message to show as a toast (e.g. "Level up!"). */
	Notify: Net.Definitions.ServerToClientEvent<[message: string]>(),
});
