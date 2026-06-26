import type { ElementSpec } from "@elements/element-spec";

const registry = new Map<string, ElementSpec>();

export function register<Data>(spec: ElementSpec<Data>): void {
    registry.set(spec.type, spec as ElementSpec);
}

export function getElement(type: string): ElementSpec | undefined {
    return registry.get(type);
}

export function listElements(): ElementSpec[] {
    return [...registry.values()];
}
