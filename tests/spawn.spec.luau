-- Headless spawn tests for EnemyService (src/server/combat/EnemyService.ts).
--
-- Run headless:
--   pnpm build:place
--   pnpm test:spawn
--
-- run-in-roblox runs at plugin-level security in edit mode, where server
-- Scripts never execute. So this drives EnemyService directly rather than
-- waiting for main.server to build the world — see tests/smoke.play.luau for
-- the play-mode counterpart that covers the boot path itself.

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

local stale = Workspace:FindFirstChild("Enemies")
if stale then
	stale:Destroy()
end

local service = EnemyService.new()
service:start()

local folder = Workspace:FindFirstChild("Enemies")
check("Workspace.Enemies folder exists", folder ~= nil)

if folder then
	local dummies = {}
	for _, child in folder:GetChildren() do
		if child.Name == "TrainingDummy" then
			table.insert(dummies, child)
		end
	end
	eq("3 training dummies spawned", #dummies, 3)

	local fullHealth = ("HP %d/%d"):format(config.Enemies.maxHealth, config.Enemies.maxHealth)

	for i, dummy in dummies do
		check(("dummy %d has IsEnemy attribute"):format(i), dummy:GetAttribute("IsEnemy") == true)

		local body = dummy:FindFirstChild("Body")
		check(("dummy %d has Body part"):format(i), body ~= nil)

		local gui = body and body:FindFirstChild("HealthGui")
		local label = gui and gui:FindFirstChild("HealthLabel")
		check(
			("dummy %d shows full health"):format(i),
			label ~= nil and (label :: TextLabel).Text == fullHealth,
			if label then (label :: TextLabel).Text else "no label"
		)
	end

	folder:Destroy()
end

print(("[TEST] DONE — %d passed, %d failed"):format(passed, failed))
if failed > 0 then
	error(("[TEST] %d assertion(s) failed"):format(failed))
end
