/**
 * Builds an Instance from a props object with nested `Children`.
 * `Parent` is applied last, per Roblox convention.
 */

export type InstanceProps<T extends Instance> = Partial<WritableInstanceProperties<T>> & {
	readonly Children?: ReadonlyArray<Instance>;
};

export function create<T extends keyof CreatableInstances>(
	className: T,
	props: InstanceProps<CreatableInstances[T]> = {},
): CreatableInstances[T] {
	const instance = new Instance(className);
	const parent = (props as { Parent?: Instance }).Parent;

	for (const [key, value] of pairs(props as unknown as Map<string, unknown>)) {
		if (key === "Children" || key === "Parent") continue;
		instance[key as never] = value as never;
	}

	const children = props.Children;
	if (children !== undefined) {
		for (const child of children) {
			child.Parent = instance;
		}
	}

	if (parent !== undefined) {
		instance.Parent = parent;
	}

	return instance;
}
