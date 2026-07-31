-- Headless logic tests for progression math (src/shared/config/game.ts).
--
-- Run headless:
--   pnpm build:place
--   pnpm test:logic
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
		"[TEST] Could not require ReplicatedStorage.TS.config.game — run `pnpm build:place` first. "
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
eq("EnemyKinds.Ghoul.maxHealth", config.EnemyKinds.Ghoul.maxHealth, 60)
eq("EnemyKinds.Ghoul.xpReward", config.EnemyKinds.Ghoul.xpReward, 25)
eq("EnemyKinds.Robot.maxHealth", config.EnemyKinds.Robot.maxHealth, 90)
eq("EnemyKinds.Robot.xpReward", config.EnemyKinds.Robot.xpReward, 40)

-- Structural checks over the whole registry, so a newly added enemy type is
-- covered by these without anyone remembering to extend this file.
for kind, stats in config.EnemyKinds do
	check(("%s: has a displayName"):format(kind), typeof(stats.displayName) == "string" and stats.displayName ~= "")
	check(("%s: maxHealth is positive"):format(kind), typeof(stats.maxHealth) == "number" and stats.maxHealth > 0)
	check(("%s: xpReward is positive"):format(kind), typeof(stats.xpReward) == "number" and stats.xpReward > 0)
	check(
		("%s: respawnDelay is non-negative"):format(kind),
		typeof(stats.respawnDelay) == "number" and stats.respawnDelay >= 0
	)
end

-- Every spawn point must name a type that actually exists, or EnemyService
-- would index nil at runtime and take the server boot down with it.
for index, spawn in config.EnemySpawns do
	check(
		("EnemySpawns[%d]: %s is a known kind"):format(index, tostring(spawn.kind)),
		config.EnemyKinds[spawn.kind] ~= nil
	)
end

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
	-- A single ghoul kill (25 xp) should not level a fresh player.
	local level, xp = simulateAward(1, 0, config.EnemyKinds.Ghoul.xpReward)
	eq("oneGhoulKill: level", level, 1)
	eq("oneGhoulKill: xp", xp, 25)
end

-- Generalised: no single kill of any type should level a fresh player, or the
-- first thing a new player attacks hands them a level and the curve means
-- nothing. Holds for a new enemy type automatically.
for kind, stats in config.EnemyKinds do
	local level = simulateAward(1, 0, stats.xpReward)
	check(
		("oneKill(%s) does not level a fresh player"):format(kind),
		level == 1,
		("%d xp vs %d needed"):format(stats.xpReward, config.xpToNext(1))
	)
end

print(("[TEST] DONE — %d passed, %d failed"):format(passed, failed))
if failed > 0 then
	error(("[TEST] %d assertion(s) failed"):format(failed))
end
