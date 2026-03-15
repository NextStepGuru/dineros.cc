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
      const rawCharCodes = [...hashedString.slice(0, 30)].map((c) =>
        c.charCodeAt(0),
      );
      const decodedHex =
        typeof Buffer !== "undefined"
          ? Buffer.from(decoded, "latin1").toString("hex").slice(0, 60)
          : "[no Buffer]";
      const looksLikePlaintext =
        hashedString.length < 50 &&
        /^[\x20-\x7e]+$/.test(hashedString) &&
        !decoded.startsWith("$argon2");
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
          hint: looksLikePlaintext
            ? "DB has plaintext password, not a hash. Re-set password via app (forgot-password or change-password) so it is hashed."
            : hashedString.length < 50
              ? "Decrypted password from DB is very short → likely wrong DB_ENCRYPTION_KEY in this process"
              : undefined,
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
