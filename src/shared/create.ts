/**
 * Declarative Instance construction.
 *
 * Instead of creating an Instance and mutating it field by field, describe it
 * with a single props object — including nested `Children` — and get a fully
 * typed Instance back. `Parent` is always applied last (after every other
 * property and all children), which is the Roblox-recommended order.
 *
 * ```ts
 * const panel = create("Frame", {
 *     Name: "StatsPanel",
 *     Size: UDim2.fromOffset(260, 96),
 *     Children: [
 *         create("UICorner", { CornerRadius: new UDim(0, 8) }),
 *     ],
 *     Parent: screen,
 * });
 * ```
 */

export type InstanceProps<T extends Instance> = Partial<WritableInstanceProperties<T>> & {
	readonly Children?: ReadonlyArray<Instance>;
};

export function create<T extends keyof CreatableInstances>(
	className: T,
	props: InstanceProps<CreatableInstances[T]> = {},
): CreatableInstances[T] {
	const instance = new Instance(className);
	// Parent is common to every Instance but not provable on the generic mapped
	// type, so read it through a narrow cast.
	const parent = (props as { Parent?: Instance }).Parent;

	for (const [key, value] of pairs(props as unknown as Map<string, unknown>)) {
		// Children and Parent are handled separately, after the rest, below.
		if (key === "Children" || key === "Parent") continue;
		instance[key as never] = value as never;
	}

	const children = props.Children;
	if (children !== undefined) {
		for (const child of children) {
			child.Parent = instance;
		}
	}

	// Parent last: configure the instance (and its children) fully before it
	// enters the DataModel.
	if (parent !== undefined) {
		instance.Parent = parent;
	}

	return instance;
}
