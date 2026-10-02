import { describe, expect, it } from "vitest";
import { sessionUserFromDb } from "../sessionUserProfile";

function dbUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    firstName: "Jeremy",
    lastName: "D",
    email: "jeremy@example.com",
    countryId: 840,
    timezoneOffset: -5,
    isDaylightSaving: false,
    settings: {},
    password: "$argon2id$hash",
    ...overrides,
  };
}

describe("sessionUserFromDb", () => {
  it("maps a db row to the session shape and strips the password hash", () => {
    const session = sessionUserFromDb(dbUser());

    expect(session).toMatchObject({
      id: 1,
      firstName: "Jeremy",
      lastName: "D",
      email: "jeremy@example.com",
      role: "USER",
      isAdmin: false,
    });
    expect("password" in session).toBe(false);
    expect(Object.values(session)).not.toContain("$argon2id$hash");
  });

  it("treats the configured admin email as ADMIN without a db role", () => {
    const session = sessionUserFromDb(dbUser({ email: "admin@dineros.cc" }));

    expect(session.role).toBe("ADMIN");
    expect(session.isAdmin).toBe(true);
  });

  it("preserves an explicit db role over the admin-email default", () => {
    const session = sessionUserFromDb(
      dbUser({ email: "someone@dineros.cc", role: "USER" }),
    );
    expect(session.role).toBe("USER");

    const admin = sessionUserFromDb(dbUser({ role: "ADMIN" }));
    expect(admin.role).toBe("ADMIN");
    expect(admin.isAdmin).toBe(true);
  });

  it("still requires names but tolerates legacy (non-RFC) db emails", () => {
    expect(() => sessionUserFromDb(dbUser({ firstName: "" }))).toThrow();
    expect(() => sessionUserFromDb(dbUser({ lastName: "" }))).toThrow();
    // userProfileFromDbSchema relaxes email to a plain string for legacy rows.
    expect(() =>
      sessionUserFromDb(dbUser({ email: "legacy-no-at-sign" })),
    ).not.toThrow();
    expect(() => sessionUserFromDb(dbUser({ email: 42 }))).toThrow();
  });
});
