import argon2 from "@node-rs/argon2";

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
    const isPasswordValid = await argon2.verify(
      atob(hashedString),
      inputString
    );

    return isPasswordValid;
  }
}

export default HashService;
