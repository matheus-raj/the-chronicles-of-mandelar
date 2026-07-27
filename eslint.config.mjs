import robloxTs from "eslint-plugin-roblox-ts";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
	{
		ignores: ["out/**", "include/**", "node_modules/**"],
	},
	robloxTs.configs.recommended,
	prettier,
);
