-- Headless unit tests for the enemy brain (src/server/combat/EnemyBrain.ts).
--
-- Run headless:
--   pnpm build:place
--   pnpm test:ai
--
-- The brain is a pure state machine: positions and numbers in, state and
-- intents out, no Roblox instances and no players. That purity is the point —
-- every serious bug in this project so far lived in behaviour the headless
-- suite couldn't see, so the behaviour core is built to be testable without a
-- play session. Randomness is injected: rng() is a parameter, and these tests
-- pass constants to make every decision deterministic.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")

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

local okReq, loaded = pcall(function()
	return {
		config = require(ReplicatedStorage.TS.config.game),
		Brain = require(ServerScriptService.TS.combat.EnemyBrain),
	}
end)

if not okReq then
	error("[TEST] Could not require the compiled modules — run `pnpm build:place` first. " .. tostring(loaded))
end

local config = loaded.config
local Brain = loaded.Brain

local ORIGIN = Vector3.new(0, 0, 0)
local rngZero = function()
	return 0
end

-- Build a BrainInput with defaults; override via the table.
local function input(kind, overrides)
	local base = {
		dt = 1 / 30,
		position = ORIGIN,
		origin = ORIGIN,
		nearestPlayer = nil,
		kind = kind,
		rng = rngZero,
	}
	for k, v in overrides or {} do
		base[k] = v
	end
	return base
end

local ghoul = config.EnemyKinds.Ghoul

-- ============================== Idle & Wander ==============================

do
	local out = Brain.decide(Brain.initialState(), input(ghoul, { dt = 0.1 }))
	eq("fresh idle: pause expires into Wander", out.state.mode, "Wander")
	check("wander goal is near the post", Brain.flatDistance(out.state.goal, ORIGIN) <= ghoul.wanderRadius + 0.01)
	eq("wander ambles at half speed", out.speedScale, 0.5)
	eq("wander does not swing", out.swing, false)
end

do
	local out = Brain.decide({ mode = "Idle", pauseRemaining = 5 }, input(ghoul, { dt = 1 }))
	eq("mid-pause: stays Idle", out.state.mode, "Idle")
	check("pause ticks down by dt", math.abs(out.state.pauseRemaining - 4) < 1e-6)
	eq("idle does not move", out.moveToward, nil)
end

do
	-- rng of 0.5 → distance = sqrt(0.5) * radius; must still be inside radius.
	local rngHalf = function()
		return 0.5
	end
	local out = Brain.decide({ mode = "Idle", pauseRemaining = 0 }, input(ghoul, { rng = rngHalf }))
	check(
		"wander goals stay inside wanderRadius for mid rng",
		Brain.flatDistance(out.state.goal, ORIGIN) <= ghoul.wanderRadius + 0.01
	)
end

do
	local goal = Vector3.new(4, 0, 0)
	local out = Brain.decide({ mode = "Wander", goal = goal }, input(ghoul, { position = Vector3.new(1, 0, 0) }))
	eq("mid-amble: keeps walking to its goal", out.state.mode, "Wander")
	eq("amble target unchanged", out.moveToward, goal)

	local arrived = Brain.decide({ mode = "Wander", goal = goal }, input(ghoul, { position = Vector3.new(3.9, 0, 0) }))
	eq("arriving at the goal: back to Idle", arrived.state.mode, "Idle")
	check("arrival pause is at least the minimum", arrived.state.pauseRemaining >= 2)
end

-- ============================== Aggro ==============================

do
	local near = Vector3.new(ghoul.aggroRange - 1, 0, 0)
	local out = Brain.decide({ mode = "Idle", pauseRemaining = 5 }, input(ghoul, { nearestPlayer = near }))
	eq("player inside aggro while Idle: Chase", out.state.mode, "Chase")
	eq("chase heads at the player", out.moveToward, near)

	local wanderOut =
		Brain.decide({ mode = "Wander", goal = Vector3.new(4, 0, 0) }, input(ghoul, { nearestPlayer = near }))
	eq("player inside aggro mid-amble: Chase", wanderOut.state.mode, "Chase")
end

do
	local far = Vector3.new(ghoul.aggroRange + 2, 0, 0)
	local out = Brain.decide({ mode = "Idle", pauseRemaining = 5 }, input(ghoul, { nearestPlayer = far }))
	eq("player outside aggro: not provoked", out.state.mode, "Idle")
end

-- ============================== Chase & Attack ==============================

do
	local inRange = Vector3.new(ghoul.attackRange - 1, 0, 0)
	local out = Brain.decide({ mode = "Chase" }, input(ghoul, { nearestPlayer = inRange }))
	eq("closing to attack range: Attack", out.state.mode, "Attack")
	eq("first swing lands immediately", out.swing, true)
	check("cooldown reset to the interval", math.abs(out.state.cooldownRemaining - ghoul.attackInterval) < 1e-6)
end

do
	local inRange = Vector3.new(ghoul.attackRange - 1, 0, 0)
	local mid = Brain.decide(
		{ mode = "Attack", cooldownRemaining = ghoul.attackInterval },
		input(ghoul, { nearestPlayer = inRange, dt = 0.4 })
	)
	eq("mid-cooldown: no swing", mid.swing, false)
	eq("mid-cooldown: still Attack", mid.state.mode, "Attack")

	local ready = Brain.decide(
		{ mode = "Attack", cooldownRemaining = 0.3 },
		input(ghoul, { nearestPlayer = inRange, dt = 0.4 })
	)
	eq("cooldown expired: swings again", ready.swing, true)
end

do
	-- Player steps out of attack range but the fight is still on.
	local backedOff = Vector3.new(ghoul.attackRange + 3, 0, 0)
	local out = Brain.decide(
		{ mode = "Attack", cooldownRemaining = 1 },
		input(ghoul, { nearestPlayer = backedOff })
	)
	eq("target backs out of reach: Attack resumes Chase", out.state.mode, "Chase")
	eq("no swing while chasing", out.swing, false)
end

do
	-- Anti-cheese: stepping just past aggroRange must NOT end a fight.
	local edgeDancer = Vector3.new(ghoul.aggroRange + 5, 0, 0)
	local out = Brain.decide({ mode = "Chase" }, input(ghoul, { nearestPlayer = edgeDancer }))
	eq("target beyond aggro but leash intact: keeps chasing", out.state.mode, "Chase")
end

-- ============================== Leash & Return ==============================

do
	-- Dragged past the leash: evade — heal and go home.
	local pos = Vector3.new(ghoul.leashRange + 1, 0, 0)
	local player = Vector3.new(ghoul.leashRange + 4, 0, 0)
	local out = Brain.decide({ mode = "Chase" }, input(ghoul, { position = pos, nearestPlayer = player }))
	eq("leash broken: Return", out.state.mode, "Return")
	eq("leash break heals to full", out.healToFull, true)
end

do
	-- No living player left mid-fight (died, or left the game): evade too.
	local out = Brain.decide({ mode = "Attack", cooldownRemaining = 0.5 }, input(ghoul, {}))
	eq("no living target mid-fight: Return", out.state.mode, "Return")
	eq("target loss heals to full", out.healToFull, true)
end

do
	-- Returning enemies are hostile to no one, even someone stood on them.
	local pos = Vector3.new(20, 0, 0)
	local onTop = Vector3.new(21, 0, 0)
	local out = Brain.decide({ mode = "Return" }, input(ghoul, { position = pos, nearestPlayer = onTop }))
	eq("returning: ignores players inside aggro", out.state.mode, "Return")
	eq("returning heads home", out.moveToward, ORIGIN)
	eq("no double heal while walking home", out.healToFull, false)

	local home = Brain.decide({ mode = "Return" }, input(ghoul, { position = Vector3.new(0.2, 0, 0) }))
	eq("reaching home: back to Idle", home.state.mode, "Idle")
end

-- ============================== Every kind ==============================

-- The transitions above use the ghoul; these hold structurally for all kinds,
-- so a new enemy type gets its numbers exercised without touching this file.
local kindIds = {}
for kind in config.EnemyKinds do
	table.insert(kindIds, kind)
end
table.sort(kindIds)

for _, kindId in kindIds do
	local kind = config.EnemyKinds[kindId]

	local inside = Brain.decide(
		{ mode = "Idle", pauseRemaining = 5 },
		input(kind, { nearestPlayer = Vector3.new(kind.aggroRange - 1, 0, 0) })
	)
	eq(("%s: charges inside its own aggroRange"):format(kindId), inside.state.mode, "Chase")

	local outside = Brain.decide(
		{ mode = "Idle", pauseRemaining = 5 },
		input(kind, { nearestPlayer = Vector3.new(kind.aggroRange + 1, 0, 0) })
	)
	eq(("%s: calm outside its own aggroRange"):format(kindId), outside.state.mode, "Idle")

	local swing = Brain.decide(
		{ mode = "Chase" },
		input(kind, { nearestPlayer = Vector3.new(kind.attackRange - 0.5, 0, 0) })
	)
	check(
		("%s: swings with its own cooldown"):format(kindId),
		swing.swing == true and math.abs(swing.state.cooldownRemaining - kind.attackInterval) < 1e-6
	)

	local leashed = Brain.decide(
		{ mode = "Chase" },
		input(kind, {
			position = Vector3.new(kind.leashRange + 1, 0, 0),
			nearestPlayer = Vector3.new(kind.leashRange + 3, 0, 0),
		})
	)
	check(("%s: leashes at its own range"):format(kindId), leashed.state.mode == "Return" and leashed.healToFull)
end

print(("[TEST] DONE — %d passed, %d failed"):format(passed, failed))
if failed > 0 then
	error(("[TEST] %d assertion(s) failed"):format(failed))
end
