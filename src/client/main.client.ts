/**
 * Client entry point. Starts the HUD and attack input.
 * Compiles to a LocalScript under StarterPlayerScripts.
 */

import { GAME_NAME } from "shared/greeting";
import { Hud } from "client/ui/Hud";
import { AttackController } from "client/combat/AttackController";

print(`[${GAME_NAME}] client starting...`);

new Hud().start();
new AttackController().start();
