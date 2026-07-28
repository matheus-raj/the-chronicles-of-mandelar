-- Headless logic tests for progression math (src/shared/config/game.ts).
--
-- Run headless:
--   npm run build:place
--   npm run test:logic
-- ...or paste the file contents into the Roblox Studio MCP `run_code` tool
-- with the built place open in Studio.
--
-- Exits with an error (non-zero) if any assertion fails, so CI / run-in-roblox
-- can detect failure.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local passed = 0
local failed = 0

local function check(name: string, condition: boolean, detail: string?)
	if condition then
		passed += 1
		print(("[TEST] PASS  %s"):format(name))
	else
		failed += 1
		print(("[TEST] FAIL  %s%s"):format(name, if detail then " — " .. detail else ""))
	end
end

local function eq(name: string, actual: unknown, expected: unknown)
	check(name, actual == expected, ("expected %s, got %s"):format(tostring(expected), tostring(actual)))
end

-- src/shared/config/game.ts compiles to ReplicatedStorage/TS/config/game
local okReq, config = pcall(function()
	return require(ReplicatedStorage.TS.config.game)
end)

if not okReq then
	error(
		"[TEST] Could not require ReplicatedStorage.TS.config.game — run `npm run build:place` first. "
			.. tostring(config)
	)
end

-- xpToNext(level) = floor(100 * level ^ 1.5)
eq("xpToNext(1)", config.xpToNext(1), 100)
eq("xpToNext(2)", config.xpToNext(2), 282)
eq("xpToNext(3)", config.xpToNext(3), 519)
eq("xpToNext(4)", config.xpToNext(4), 800)

-- maxHealthForLevel(level) = 100 + (level - 1) * 20
eq("maxHealthForLevel(1)", config.maxHealthForLevel(1), 100)
eq("maxHealthForLevel(2)", config.maxHealthForLevel(2), 120)
eq("maxHealthForLevel(5)", config.maxHealthForLevel(5), 180)

-- Tuning constants the rest of the game depends on.
eq("Combat.attackDamage", config.Combat.attackDamage, 20)
eq("Enemies.maxHealth", config.Enemies.maxHealth, 60)
eq("Enemies.xpReward", config.Enemies.xpReward, 25)

-- Mirror the server's level-up loop (PlayerDataService.addXp) to guard the loop
-- logic against config drift.
local function simulateAward(level: number, xp: number, amount: number): (number, number)
	xp += amount
	while xp >= config.xpToNext(level) do
		xp -= config.xpToNext(level)
		level += 1
	end
	return level, xp
end

do
	-- +300 xp clears level 1 (needs 100); 200 remain, below level 2's 282.
	local level, xp = simulateAward(1, 0, 300)
	eq("levelUp: level after +300xp", level, 2)
	eq("levelUp: xp after +300xp", xp, 200)
end

do
	-- A single dummy kill (25 xp) should not level a fresh player.
	local level, xp = simulateAward(1, 0, config.Enemies.xpReward)
	eq("oneKill: level", level, 1)
	eq("oneKill: xp", xp, 25)
end

print(("[TEST] DONE — %d passed, %d failed"):format(passed, failed))
if failed > 0 then
	error(("[TEST] %d assertion(s) failed"):format(failed))
end
