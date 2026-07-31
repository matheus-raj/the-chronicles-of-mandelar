-- Play-mode smoke test: verifies the server booted, built the world, and that
-- enemies actually behave — aggro, damage, evade, and the death penalty.
--
-- Requires play mode, so it runs *only* via the Roblox Studio MCP bridge with
-- the place open: `start_stop_play`, then `execute_luau` with
-- `datamodel_type: "Server"`. run-in-roblox cannot run this — it executes at
-- plugin-level security in edit mode, where server Scripts never start. For
-- headless equivalents see tests/spawn.spec.luau (spawning) and
-- tests/ai.spec.luau (the brain's decisions).
--
-- FAIR WARNING: the behaviour section MOVES AND KILLS the test player's
-- character (teleports it next to a ghoul, later sets its health to 0) to
-- exercise combat and the death penalty end to end. Everything is left in a
-- sane state: the character respawns at the pad and enemies walk home.
--
-- Exits with an error if any assertion fails.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

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

-- Poll until the predicate holds or the timeout passes. Behaviour is
-- continuous, so fixed sleeps would be either flaky or slow; this is neither.
local function waitUntil(timeout: number, predicate: () -> boolean): boolean
	local deadline = os.clock() + timeout
	while os.clock() < deadline do
		if predicate() then
			return true
		end
		task.wait(0.25)
	end
	return predicate()
end

local okConfig, config = pcall(function()
	return require(ReplicatedStorage.TS.config.game)
end)

if not okConfig then
	error("[TEST] Could not require the compiled config — run `pnpm build:place` first. " .. tostring(config))
end

-- ========================= Section 1: the world =========================

-- WorldService.start() builds the floor. Without it a joining character has
-- nothing to stand on, falls past FallenPartsDestroyHeight, and respawn-loops —
-- so this is the assertion that the game is playable at all.
local ground = Workspace:WaitForChild("Ground", 10) :: BasePart?
check("Workspace.Ground exists", ground ~= nil)
if ground then
	eq("ground is anchored", ground.Anchored, true)
	eq("ground can be stood on", ground.CanCollide, true)
	eq("ground is the configured size", ground.Size.X, config.World.groundSize)
	check(
		"ground's top face is at y = 0",
		math.abs((ground.Position.Y + ground.Size.Y / 2) - 0) < 0.01,
		("top y = %.3f"):format(ground.Position.Y + ground.Size.Y / 2)
	)
end

local spawnPad = Workspace:FindFirstChild("SpawnPad")
check("Workspace.SpawnPad exists", spawnPad ~= nil)
if spawnPad then
	check("spawn pad is a SpawnLocation", spawnPad:IsA("SpawnLocation"))
	check(
		"spawn pad sits on the ground",
		math.abs(((spawnPad :: BasePart).Position.Y - (spawnPad :: BasePart).Size.Y / 2) - 0) < 0.01
	)
end

-- ========================= Section 2: the enemies =========================

local expectedCounts: { [string]: number } = {}
local expectedTotal = 0
for _, spawn in config.EnemySpawns do
	expectedCounts[spawn.kind] = (expectedCounts[spawn.kind] or 0) + 1
	expectedTotal += 1
end

local kindIds: { string } = {}
for kind in config.EnemyKinds do
	table.insert(kindIds, kind)
end
table.sort(kindIds)

local enemiesFolder = Workspace:WaitForChild("Enemies", 10)
check("Workspace.Enemies folder exists", enemiesFolder ~= nil)

if enemiesFolder then
	local spawned = {}
	local actualCounts: { [string]: number } = {}

	for _, child in enemiesFolder:GetChildren() do
		local kind = child:GetAttribute("EnemyKind")
		if typeof(kind) == "string" then
			table.insert(spawned, child)
			actualCounts[kind] = (actualCounts[kind] or 0) + 1
		end
	end

	eq("total enemies spawned", #spawned, expectedTotal)

	for _, kind in kindIds do
		eq(("%s count"):format(kind), actualCounts[kind] or 0, expectedCounts[kind] or 0)
	end

	for _, enemy in spawned do
		local kind = enemy:GetAttribute("EnemyKind") :: string
		local stats = config.EnemyKinds[kind]

		check(("%s: kind is a known type"):format(kind), stats ~= nil)
		if not stats then
			continue
		end

		eq(("%s: model named after its type"):format(kind), enemy.Name, stats.displayName)
		check(("%s: has IsEnemy attribute"):format(kind), enemy:GetAttribute("IsEnemy") == true)

		local body = enemy:FindFirstChild("Body")
		check(("%s: has Body part"):format(kind), body ~= nil)

		if body then
			local part = body :: BasePart
			local underside = part.Position.Y - part.Size.Y / 2
			check(
				("%s: feet rest on the ground, not floating"):format(kind),
				math.abs(underside) < 0.01,
				("underside y = %.3f, expected 0"):format(underside)
			)

			-- Unprovoked enemies stay near their post: wander is bounded.
			local origin = enemy:GetAttribute("Origin")
			check(("%s: carries an Origin attribute"):format(kind), typeof(origin) == "Vector3")
			if typeof(origin) == "Vector3" then
				local dx = part.Position.X - origin.X
				local dz = part.Position.Z - origin.Z
				local drift = math.sqrt(dx * dx + dz * dz)
				check(
					("%s: within wanderRadius of its post"):format(kind),
					drift <= stats.wanderRadius + 0.5,
					("%.2f studs from post, radius %d"):format(drift, stats.wanderRadius)
				)
			end
		end

		local gui = body and body:FindFirstChild("HealthGui")
		local label = gui and gui:FindFirstChild("HealthLabel")
		local fullHealth = ("HP %d/%d"):format(stats.maxHealth, stats.maxHealth)
		check(
			("%s: spawns at full health (%s)"):format(kind, fullHealth),
			label ~= nil and (label :: TextLabel).Text == fullHealth,
			if label then ("%s (expected %s)"):format((label :: TextLabel).Text, fullHealth) else "no label"
		)
	end
end

-- ==================== Section 3: behaviour, end to end ====================
-- Aggro → chase → damage → death penalty → evade-and-heal. Drives the live
-- services through the TestApi bindables in ServerStorage: execute_luau runs
-- in a separate Lua environment from game scripts, so require() would yield a
-- fresh empty module — Instances are the only bridge (see src/server/testApi.ts).

local ServerStorage = game:GetService("ServerStorage")
local testApi = ServerStorage:WaitForChild("TestApi", 10)
local player = Players:FindFirstChildOfClass("Player")

if testApi == nil then
	check("TestApi bridge is present", false, "main.server did not run or bridge missing")
elseif player == nil or enemiesFolder == nil then
	check("a test player is present", false, "behaviour section needs a play-mode player")
else
	local addXp = testApi:WaitForChild("AddXp") :: BindableFunction
	local damageEnemy = testApi:WaitForChild("DamageEnemy") :: BindableFunction
	local getEnemyHealth = testApi:WaitForChild("GetEnemyHealth") :: BindableFunction

	-- The ghoul we'll fight: the one whose post is nearest the pad.
	local ghoul: Model?
	for _, e in enemiesFolder:GetChildren() do
		if e:GetAttribute("EnemyKind") == "Ghoul" then
			if ghoul == nil then
				ghoul = e
			else
				local a = (e:GetAttribute("Origin") :: Vector3).Magnitude
				local b = ((ghoul :: Model):GetAttribute("Origin") :: Vector3).Magnitude
				if a < b then
					ghoul = e
				end
			end
		end
	end
	check("found a ghoul to pick a fight with", ghoul ~= nil)

	local character = player.Character
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	local ghoulStats = config.EnemyKinds.Ghoul

	if ghoul and character and humanoid and humanoid.Health > 0 then
		local origin = ghoul:GetAttribute("Origin") :: Vector3

		-- Bank some XP so the death penalty has something to take, then wound
		-- the ghoul so the evade-heal is observable later.
		addXp:Invoke(player, 40)
		eq("XP attribute mirrors the grant", player:GetAttribute("XP"), 40)
		local levelBefore = player:GetAttribute("Level")

		check("live service owns the ghoul's handle", getEnemyHealth:Invoke(ghoul) ~= nil)
		damageEnemy:Invoke(ghoul, 20)
		eq("ghoul wounded for the heal check", getEnemyHealth:Invoke(ghoul), ghoulStats.maxHealth - 20)

		-- Step inside the ghoul's aggro range (well outside the robot's:
		-- placement is asserted by the pad-safety invariant, and this offset
		-- keeps the duel one-on-one).
		local duelSpot = origin + Vector3.new(6, 3, 12)
		character:PivotTo(CFrame.new(duelSpot))

		local healthBefore = humanoid.Health
		local hit = waitUntil(12, function()
			return humanoid.Health < healthBefore
		end)
		check(
			"provoked ghoul chases and lands a hit",
			hit,
			("health still %.0f after 12s"):format(humanoid.Health)
		)

		-- Death penalty: die, respawn, unbanked XP gone, level intact.
		humanoid.Health = 0
		local respawned = waitUntil(15, function()
			local c = player.Character
			local h = c and c:FindFirstChildOfClass("Humanoid")
			return c ~= nil and c ~= character and h ~= nil and h.Health > 0
		end)
		check("character respawns after death", respawned)
		eq("death wipes unbanked XP", player:GetAttribute("XP"), 0)
		eq("death never takes a level", player:GetAttribute("Level"), levelBefore)

		-- With its target dead the ghoul evades: full health, walks home.
		local recovered = waitUntil(20, function()
			if ghoul.Parent == nil then
				return false
			end
			local body = ghoul:FindFirstChild("Body") :: BasePart?
			if body == nil then
				return false
			end
			local label = body:FindFirstChild("HealthGui")
				and (body.HealthGui :: Instance):FindFirstChild("HealthLabel")
			local dx = body.Position.X - origin.X
			local dz = body.Position.Z - origin.Z
			local home = math.sqrt(dx * dx + dz * dz) <= ghoulStats.wanderRadius + 0.5
			local healed = label ~= nil
				and (label :: TextLabel).Text == ("HP %d/%d"):format(ghoulStats.maxHealth, ghoulStats.maxHealth)
			return home and healed
		end)
		check("ghoul evades: heals to full and returns to its post", recovered)
	end
end

print(("[TEST] DONE — %d passed, %d failed"):format(passed, failed))
if failed > 0 then
	error(("[TEST] %d assertion(s) failed"):format(failed))
end
