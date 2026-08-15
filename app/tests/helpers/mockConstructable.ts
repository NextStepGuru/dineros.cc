import { vi } from "vitest";

/** Vitest 4: implementations used with `new` must be `function` or `class`, not arrows. */
export function mockConstructable<T extends object>(instance: T) {
  return vi.fn(function MockConstructable() {
    return instance;
  });
}
