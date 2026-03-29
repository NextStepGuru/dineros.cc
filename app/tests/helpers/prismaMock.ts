import { vi } from "vitest";

type MockFn = ReturnType<typeof vi.fn>;

/**
 * Deep mock of PrismaClient for Vitest: `mock.user.findMany` is a stable `vi.fn()`
 * for assertions. Use in API tests instead of hand-building nested delegates.
 */
export function createMockPrisma(): Record<string, unknown> {
  const modelMethods = new Map<string, Map<string, MockFn>>();
  const rootDollarFns = new Map<string, MockFn>();

  function methodFor(model: string, method: string): MockFn {
    let methods = modelMethods.get(model);
    if (!methods) {
      methods = new Map();
      modelMethods.set(model, methods);
    }
    let fn = methods.get(method);
    if (!fn) {
      fn = vi.fn();
      methods.set(method, fn);
    }
    return fn;
  }

  function dollarMethod(name: string): MockFn {
    let fn = rootDollarFns.get(name);
    if (!fn) {
      fn = vi.fn();
      rootDollarFns.set(name, fn);
    }
    return fn;
  }

  return new Proxy({} as Record<string, unknown>, {
    get(_target, prop) {
      if (prop === "then") return undefined;
      const key = String(prop);
      if (key.startsWith("$")) {
        return dollarMethod(key);
      }
      return new Proxy(
        {},
        {
          get(_m, mProp) {
            if (mProp === "then") return undefined;
            return methodFor(key, String(mProp));
          },
        },
      );
    },
  });
}

/**
 * Best-effort clear; prefer `vi.clearAllMocks()` in `beforeEach` for the test file.
 */
export function resetPrismaMock(): void {
  vi.clearAllMocks();
}

/**
 * Common named exports from `prismaClient` for `vi.mock` factories.
 * Prefer `vi.mock("…/prismaClient", async () => { const { createMockPrisma } = await import("~/tests/helpers/prismaMock"); … })`
 * so the helper loads after the mock factory runs (avoids TDZ with top-level imports).
 */
export function createPrismaClientModuleMock() {
  const prisma = createMockPrisma();
  return {
    prisma,
    getPrisma: () => prisma,
    isPrismaActive: vi.fn(),
  };
}
