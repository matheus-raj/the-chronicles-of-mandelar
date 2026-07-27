/**
 * Shared code lives here — modules that both the server and client can import.
 * roblox-ts compiles this into ReplicatedStorage.TS.
 */

export const GAME_NAME = "The Chronicles of Mandelar";

export function makeGreeting(name: string): string {
	return `Welcome to ${GAME_NAME}, ${name}!`;
}
