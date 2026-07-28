-- Play-mode smoke test: verifies the server booted and built the world.
--
-- Because it needs the server Scripts to actually run, use one of:
--   * Roblox Studio MCP `run_script_in_play_mode` tool (with the place open), or
--   * npm run build:place && npm run test:smoke   (run-in-roblox, headless)
--
-- Exits with an error if any assertion fails.

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
			label ~= nil and (label :: TextLabel).Text == "HP 60/60",
			if label then (label :: TextLabel).Text else "no label"
		)
	end
end

print(("[TEST] DONE — %d passed, %d failed"):format(passed, failed))
if failed > 0 then
	error(("[TEST] %d assertion(s) failed"):format(failed))
end
