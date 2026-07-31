-- Headless spawn tests for EnemyService (src/server/combat/EnemyService.ts).
--
-- Run headless:
--   pnpm build:place
--   pnpm test:spawn
--
-- run-in-roblox runs at plugin-level security in edit mode, where server
-- Scripts never execute. So this drives EnemyService directly rather than
-- waiting for main.server to build the world -- see tests/smoke.play.luau for
-- the play-mode counterpart that covers the boot path itself.
--
-- Everything expected here is derived from config.EnemySpawns and
-- config.EnemyKinds, so adding or retuning an enemy type needs no edit to this
-- file.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")
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

local okReq, loaded = pcall(function()
	return {
		config = require(ReplicatedStorage.TS.config.game),
		EnemyService = require(ServerScriptService.TS.combat.EnemyService).EnemyService,
	}
end)

if not okReq then
	error("[TEST] Could not require the compiled modules — run `pnpm build:place` first. " .. tostring(loaded))
end

local config = loaded.config
local EnemyService = loaded.EnemyService

-- What the spawn table says should exist, counted per kind.
local expectedCounts: { [string]: number } = {}
local expectedTotal = 0
for _, spawn in config.EnemySpawns do
	expectedCounts[spawn.kind] = (expectedCounts[spawn.kind] or 0) + 1
	expectedTotal += 1
end

-- Sorted so the output order is stable run to run.
local kindIds: { string } = {}
for kind in config.EnemyKinds do
	table.insert(kindIds, kind)
end
table.sort(kindIds)

-- The set of legitimate posts, keyed by x/z. Enemies wander while idle, so
-- their *live* position can't be asserted exactly — instead each model carries
-- an Origin attribute naming its post, which must be one of these, and the
-- body must be within wanderRadius of it.
local knownPosts: { [string]: boolean } = {}
for _, spawn in config.EnemySpawns do
	knownPosts[("%d,%d"):format(spawn.position.X, spawn.position.Z)] = true
end

local stale = Workspace:FindFirstChild("Enemies")
if stale then
	stale:Destroy()
end

local service = EnemyService.new()
service:start()

local folder = Workspace:FindFirstChild("Enemies")
check("Workspace.Enemies folder exists", folder ~= nil)

if folder then
	local spawned = {}
	local actualCounts: { [string]: number } = {}

	for _, child in folder:GetChildren() do
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
			local origin = enemy:GetAttribute("Origin")

			check(("%s: carries an Origin attribute"):format(kind), typeof(origin) == "Vector3")
			if typeof(origin) == "Vector3" then
				local key = ("%d,%d"):format(origin.X, origin.Z)
				check(
					("%s: its post is a configured spawn point"):format(kind),
					knownPosts[key] == true,
					("no spawn point at x/z %s"):format(key)
				)

				-- Wandering may have moved it, but never beyond its radius.
				local dx = part.Position.X - origin.X
				local dz = part.Position.Z - origin.Z
				local drift = math.sqrt(dx * dx + dz * dz)
				check(
					("%s: within wanderRadius of its post"):format(kind),
					drift <= stats.wanderRadius + 0.5,
					("%.2f studs from post, radius %d"):format(drift, stats.wanderRadius)
				)
			end

			-- Wherever it has ambled to, its feet stay exactly on the ground.
			check(
				("%s: feet rest on the ground, not floating"):format(kind),
				math.abs(underside) < 0.01,
				("underside y = %.3f, expected 0"):format(underside)
			)
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

	folder:Destroy()
end

print(("[TEST] DONE — %d passed, %d failed"):format(passed, failed))
if failed > 0 then
	error(("[TEST] %d assertion(s) failed"):format(failed))
end
