-- Play-mode smoke test: verifies the server booted and built the world.
--
-- Requires play mode, so it runs *only* via the Roblox Studio MCP bridge with
-- the place open: `start_stop_play`, then `execute_luau` with
-- `datamodel_type: "Server"`. run-in-roblox cannot run this — it executes at
-- plugin-level security in edit mode, where server Scripts never start. For a
-- headless equivalent see tests/spawn.spec.luau.
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

-- Read the expected health from config rather than hardcoding it, so retuning
-- Enemies.maxHealth can't make this test fail for an unrelated reason (or, worse,
-- pass while the label is stale). Mirrors tests/spawn.spec.luau.
local okConfig, config = pcall(function()
	return require(ReplicatedStorage.TS.config.game)
end)

if not okConfig then
	error("[TEST] Could not require the compiled config — run `pnpm build:place` first. " .. tostring(config))
end

local fullHealth = ("HP %d/%d"):format(config.Enemies.maxHealth, config.Enemies.maxHealth)

-- EnemyService.start() creates Workspace.Enemies and spawns the dummies.
local enemiesFolder = Workspace:WaitForChild("Enemies", 10)
check("Workspace.Enemies folder exists", enemiesFolder ~= nil)

if enemiesFolder then
	local dummies = {}
	for _, child in enemiesFolder:GetChildren() do
		if child.Name == "TrainingDummy" then
			table.insert(dummies, child)
		end
	end
	check("3 training dummies spawned", #dummies == 3, ("got %d"):format(#dummies))

	for i, dummy in dummies do
		check(("dummy %d has IsEnemy attribute"):format(i), dummy:GetAttribute("IsEnemy") == true)

		local body = dummy:FindFirstChild("Body")
		check(("dummy %d has Body part"):format(i), body ~= nil)

		local gui = body and body:FindFirstChild("HealthGui")
		local label = gui and gui:FindFirstChild("HealthLabel")
		check(
			("dummy %d shows full health"):format(i),
			label ~= nil and (label :: TextLabel).Text == fullHealth,
			if label then ("%s (expected %s)"):format((label :: TextLabel).Text, fullHealth) else "no label"
		)
	end
end

print(("[TEST] DONE — %d passed, %d failed"):format(passed, failed))
if failed > 0 then
	error(("[TEST] %d assertion(s) failed"):format(failed))
end
