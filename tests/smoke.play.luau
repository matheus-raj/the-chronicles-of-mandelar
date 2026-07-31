-- Play-mode smoke test: verifies the server booted and built the world.
--
-- Requires play mode, so it runs *only* via the Roblox Studio MCP bridge with
-- the place open: `start_stop_play`, then `execute_luau` with
-- `datamodel_type: "Server"`. run-in-roblox cannot run this — it executes at
-- plugin-level security in edit mode, where server Scripts never start. For a
-- headless equivalent see tests/spawn.spec.luau.
--
-- What differs from spawn.spec.luau: this waits for main.server to build the
-- world rather than driving EnemyService itself, so it is the only test that
-- proves the boot path wires the services up at all.
--
-- Exits with an error if any assertion fails.

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

-- Expectations come from config rather than literals, so retuning an enemy type
-- or adding one can't make this test fail for a reason unrelated to the boot
-- path it actually covers. Mirrors tests/spawn.spec.luau.
local okConfig, config = pcall(function()
	return require(ReplicatedStorage.TS.config.game)
end)

if not okConfig then
	error("[TEST] Could not require the compiled config — run `pnpm build:place` first. " .. tostring(config))
end

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

-- EnemyService.start() creates Workspace.Enemies and spawns the enemies.
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

print(("[TEST] DONE — %d passed, %d failed"):format(passed, failed))
if failed > 0 then
	error(("[TEST] %d assertion(s) failed"):format(failed))
end
