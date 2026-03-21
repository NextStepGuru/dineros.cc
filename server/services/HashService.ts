import argon2 from "@node-rs/argon2";
import { log } from "~/server/logger";

class HashService {
  // constructor() {}

  async hash(rawString: string): Promise<string> {
    const hashedPassword = await argon2.hash(rawString, {
      memoryCost: 131072, // Increase memory cost
      timeCost: 4, // Increase time cost
      parallelism: 2, // Increase parallelism
    });

    return btoa(hashedPassword);
  }

  async verify(hashedString: string, inputString: string): Promise<boolean> {
    let decoded: string;
    try {
      decoded = atob(hashedString);
    } catch {
      // Hash not valid base64 (e.g. wrong decryption key, or field not decrypted).
      return false;
    }

    // Optional: set LOGIN_DEBUG=1 to log hash shape (no secrets) for debugging verify failures.
    if (process.env.LOGIN_DEBUG === "1") {
      const rawCharCodes = Array.from(hashedString.slice(0, 30), (c) =>
        c.codePointAt(0) ?? 0,
      );
      const decodedHex =
        typeof Buffer === "undefined"
          ? "[no Buffer]"
          : Buffer.from(decoded, "latin1").toString("hex").slice(0, 60);
      const looksLikePlaintext =
        hashedString.length < 50 &&
        /^[\x20-\x7e]+$/.test(hashedString) &&
        !decoded.startsWith("$argon2");
      let hint: string | undefined;
      if (looksLikePlaintext) {
        hint =
          "DB has plaintext password, not a hash. Re-set password via app (forgot-password or change-password) so it is hashed.";
      } else if (hashedString.length < 50) {
        hint =
          "Decrypted password from DB is very short → likely wrong DB_ENCRYPTION_KEY in this process";
      }
      log({
        message: "[LOGIN][DEBUG] HashService.verify",
        level: "info",
        data: {
          rawLen: hashedString.length,
          rawCharCodes,
          rawIsPrintable: /^[\x20-\x7e]*$/.test(hashedString),
          decodedLen: decoded.length,
          decodedHex,
          decodedPrefix: decoded.slice(0, 30),
          inputLen: inputString.length,
          looksLikeArgon2: decoded.startsWith("$argon2"),
          looksLikePlaintext,
          hint,
        },
      });
    }

    // Decrypted value must look like an Argon2 hash (wrong key => garbage, avoid argon2 throw).
    if (!decoded.startsWith("$argon2") || decoded.length < 50) {
      return false;
    }

    return argon2.verify(decoded, inputString);
  }
}

export default HashService;
