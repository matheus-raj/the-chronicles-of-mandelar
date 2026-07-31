/**
 * Server entry point. Wires the game's services together and starts them.
 * Compiles to a Script under ServerScriptService.
 */

import { GAME_NAME } from "shared/greeting";
import { WorldService } from "server/world/WorldService";
import { PlayerDataService } from "server/data/PlayerDataService";
import { EnemyService } from "server/combat/EnemyService";
import { CombatService } from "server/combat/CombatService";

print(`[${GAME_NAME}] server starting...`);

const world = new WorldService();
const playerData = new PlayerDataService();
const enemies = new EnemyService();
const combat = new CombatService(enemies, playerData);

// The world goes up first: a player can be added the instant the server starts,
// and without ground their character falls out of the map and respawn-loops.
world.start();
playerData.start();
enemies.start();
combat.start();

print(`[${GAME_NAME}] server ready.`);
