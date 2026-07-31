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

-- src/shared/progression.ts — the actual award/bank/death rules the server
-- runs, not a mirror of them.
local okProg, progression = pcall(function()
	return require(ReplicatedStorage.TS.progression)
end)

if not okProg then
	error(
		"[TEST] Could not require ReplicatedStorage.TS.progression — run `pnpm build:place` first. "
			.. tostring(progression)
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
eq("Weapons.SunforgedBlade.damage", config.Weapons.SunforgedBlade.damage, 20)
eq("EnemyKinds.Ghoul.maxHealth", config.EnemyKinds.Ghoul.maxHealth, 60)
eq("EnemyKinds.Ghoul.xpReward", config.EnemyKinds.Ghoul.xpReward, 25)
eq("EnemyKinds.Robot.maxHealth", config.EnemyKinds.Robot.maxHealth, 90)
eq("EnemyKinds.Robot.xpReward", config.EnemyKinds.Robot.xpReward, 40)

-- The armoury. Structural checks so a new weapon is covered automatically,
-- plus the two invariants combat balance leans on.
do
	local weaponIds = {}
	for id in config.Weapons do
		table.insert(weaponIds, id)
	end
	table.sort(weaponIds)
	check("at least one weapon exists", #weaponIds > 0)

	for _, id in weaponIds do
		local w = config.Weapons[id]
		check(("%s: has a displayName"):format(id), typeof(w.displayName) == "string" and w.displayName ~= "")
		check(("%s: damage is positive"):format(id), typeof(w.damage) == "number" and w.damage > 0)
		check(("%s: range is positive"):format(id), typeof(w.range) == "number" and w.range > 0)
		check(("%s: cooldown is positive"):format(id), typeof(w.cooldown) == "number" and w.cooldown > 0)

		for kind, stats in config.EnemyKinds do
			-- Kiting must stay possible: every weapon outreaches every enemy,
			-- so a careful player can always trade before the enemy connects.
			check(
				("%s: outranges the %s"):format(id, kind),
				w.range > stats.attackRange,
				("range %d vs enemy reach %d"):format(w.range, stats.attackRange)
			)
			-- And no weapon deletes an enemy in one swing — a fight where the
			-- enemy never gets to exist isn't a fight.
			check(
				("%s: cannot one-shot a %s"):format(id, kind),
				w.damage < stats.maxHealth,
				("damage %d vs %d hp"):format(w.damage, stats.maxHealth)
			)
		end
	end

	check("StarterWeapons is not empty", #config.StarterWeapons > 0)
	for index, id in config.StarterWeapons do
		check(
			("StarterWeapons[%d]: %s is a known weapon"):format(index, tostring(id)),
			config.Weapons[id] ~= nil
		)
	end
end

-- The ground has to be big enough to hold every spawn point, or enemies get
-- placed off the edge of the world and the test suite would still pass.
do
	local halfGround = config.World.groundSize / 2
	for index, spawn in config.EnemySpawns do
		check(
			("EnemySpawns[%d]: within the ground slab"):format(index),
			math.abs(spawn.position.X) <= halfGround and math.abs(spawn.position.Z) <= halfGround,
			("(%d, %d) outside ±%d"):format(spawn.position.X, spawn.position.Z, halfGround)
		)
	end
	check("World.groundThickness is positive", config.World.groundThickness > 0)
	check("World.spawnPadSize is positive", config.World.spawnPadSize > 0)
end

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

	-- Behaviour tuning. The orderings aren't taste, they're what keeps the
	-- state machine coherent: an attackRange >= aggroRange enemy would swing
	-- before it ever chased, and a leashRange < aggroRange one would evade the
	-- moment it aggroed.
	check(("%s: moveSpeed is positive"):format(kind), stats.moveSpeed > 0)
	check(("%s: attackInterval is positive"):format(kind), stats.attackInterval > 0)
	check(("%s: attackDamage is positive"):format(kind), stats.attackDamage > 0)
	check(("%s: wanderRadius is non-negative"):format(kind), stats.wanderRadius >= 0)
	check(
		("%s: attackRange < aggroRange <= leashRange"):format(kind),
		stats.attackRange < stats.aggroRange and stats.aggroRange <= stats.leashRange,
		("%d / %d / %d"):format(stats.attackRange, stats.aggroRange, stats.leashRange)
	)
	check(
		("%s: wandering can't wander into a fight it can't leave"):format(kind),
		stats.wanderRadius < stats.aggroRange
	)
	check(
		("%s: escapable — slower than default player walk speed (16)"):format(kind),
		stats.moveSpeed < 16,
		("moveSpeed %d"):format(stats.moveSpeed)
	)
end

-- The spawn pad must be safe to stand on: everything charges on sight and
-- idle enemies drift up to wanderRadius from their post, so every post must
-- sit further from the pad than that combined reach. Without this, a fresh
-- (or AFK) player gets chomped the moment they load in.
do
	local padReach = config.World.spawnPadSize / 2
	for index, spawn in config.EnemySpawns do
		local stats = config.EnemyKinds[spawn.kind]
		local distance = math.sqrt(spawn.position.X ^ 2 + spawn.position.Z ^ 2)
		local required = stats.aggroRange + stats.wanderRadius + padReach
		check(
			("EnemySpawns[%d]: %s post can't aggro the spawn pad"):format(index, spawn.kind),
			distance > required,
			("%.1f studs from pad, needs > %.1f"):format(distance, required)
		)
	end
end

-- Every spawn point must name a type that actually exists, or EnemyService
-- would index nil at runtime and take the server boot down with it.
for index, spawn in config.EnemySpawns do
	check(
		("EnemySpawns[%d]: %s is a known kind"):format(index, tostring(spawn.kind)),
		config.EnemyKinds[spawn.kind] ~= nil
	)
end

-- The award/bank/death rules, tested on the shared module the server itself
-- uses (shared/progression.ts) — nothing here mirrors server code.

local function state(level: number, xp: number, bankedXp: number)
	return { level = level, xp = xp, bankedXp = bankedXp }
end

do
	-- Kills earn at-risk XP; nothing is banked until the player says so.
	local r = progression.awardXp(state(1, 0, 0), 30)
	eq("award: xp after +30", r.state.xp, 30)
	eq("award: nothing auto-banks", r.state.bankedXp, 0)
	eq("award: no level from 30xp", r.state.level, 1)
	eq("award: levelsGained", r.levelsGained, 0)

	-- Banking protects everything currently held, and reports what it protected.
	local b = progression.bankXp(r.state)
	eq("bank: protects all current xp", b.state.bankedXp, 30)
	eq("bank: xp unchanged", b.state.xp, 30)
	eq("bank: reports amount newly banked", b.banked, 30)

	-- Banking again with nothing new is a no-op that says so.
	local b2 = progression.bankXp(b.state)
	eq("bank: second bank is a no-op", b2.banked, 0)

	-- New XP on top of banked XP stays at risk.
	local r2 = progression.awardXp(b.state, 40)
	eq("award: banked survives new gains", r2.state.bankedXp, 30)
	eq("award: xp accumulates", r2.state.xp, 70)

	-- Death takes only the at-risk portion.
	local d = progression.applyDeath(r2.state)
	eq("death: xp resets to banked", d.state.xp, 30)
	eq("death: reports the loss", d.lost, 40)
	eq("death: level survives", d.state.level, 1)

	-- Fully banked, death costs nothing.
	local d2 = progression.applyDeath(d.state)
	eq("death: fully banked loses nothing", d2.lost, 0)
end

do
	-- +300 xp clears level 1 (needs 100); 200 remain, below level 2's 282.
	local r = progression.awardXp(state(1, 0, 0), 300)
	eq("levelUp: level after +300xp", r.state.level, 2)
	eq("levelUp: xp after +300xp", r.state.xp, 200)
	eq("levelUp: levelsGained", r.levelsGained, 1)
end

do
	-- +400 xp: 400 clears level 1 (100), the remaining 300 clears level 2 (282).
	local r = progression.awardXp(state(1, 0, 0), 400)
	eq("multiLevel: level after +400xp", r.state.level, 3)
	eq("multiLevel: xp after +400xp", r.state.xp, 18)
	eq("multiLevel: levelsGained", r.levelsGained, 2)
end

do
	-- Level-up cost comes out of the banked portion first: the protected XP
	-- became a protected level, and the fresh overflow stays at risk.
	local r = progression.awardXp(state(1, 90, 90), 25)
	eq("levelUp: consumes banked first — level", r.state.level, 2)
	eq("levelUp: consumes banked first — xp", r.state.xp, 15)
	eq("levelUp: consumes banked first — banked", r.state.bankedXp, 0)

	-- The invariant holds through the whole cycle: bankedXp <= xp, always.
	check("invariant: banked <= xp after level-up", r.state.bankedXp <= r.state.xp)
end

do
	-- A single ghoul kill (25 xp) should not level a fresh player.
	local r = progression.awardXp(state(1, 0, 0), config.EnemyKinds.Ghoul.xpReward)
	eq("oneGhoulKill: level", r.state.level, 1)
	eq("oneGhoulKill: xp", r.state.xp, 25)
end

-- Generalised: no single kill of any type should level a fresh player, or the
-- first thing a new player attacks hands them a level and the curve means
-- nothing. Holds for a new enemy type automatically.
for kind, stats in config.EnemyKinds do
	local r = progression.awardXp(state(1, 0, 0), stats.xpReward)
	check(
		("oneKill(%s) does not level a fresh player"):format(kind),
		r.state.level == 1,
		("%d xp vs %d needed"):format(stats.xpReward, config.xpToNext(1))
	)
end

-- The Sunwell. Banking must be a moment of safety: the station has to sit on
-- the map, out of reach of every enemy post's combined aggro + wander drift,
-- and its prompt must be quick enough to never feel like a chore.
do
	local station = config.Banking.stationPosition
	local halfGround = config.World.groundSize / 2
	check(
		"Sunwell: on the ground slab",
		math.abs(station.X) <= halfGround and math.abs(station.Z) <= halfGround
	)

	for index, spawn in config.EnemySpawns do
		local stats = config.EnemyKinds[spawn.kind]
		local dx = spawn.position.X - station.X
		local dz = spawn.position.Z - station.Z
		local distance = math.sqrt(dx ^ 2 + dz ^ 2)
		local required = stats.aggroRange + stats.wanderRadius
		check(
			("Sunwell: safe from EnemySpawns[%d] (%s)"):format(index, spawn.kind),
			distance > required,
			("%.1f studs away, needs > %.1f"):format(distance, required)
		)
	end

	check("Sunwell: holdSeconds is non-negative", config.Banking.holdSeconds >= 0)
	check(
		"Sunwell: holdSeconds is deliberate but not a chore",
		config.Banking.holdSeconds <= 2,
		("holdSeconds %.2f"):format(config.Banking.holdSeconds)
	)
	check("Sunwell: promptRange is positive", config.Banking.promptRange > 0)
end

print(("[TEST] DONE — %d passed, %d failed"):format(passed, failed))
if failed > 0 then
	error(("[TEST] %d assertion(s) failed"):format(failed))
end
