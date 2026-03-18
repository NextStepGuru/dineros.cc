import { prisma } from "~/server/clients/prismaClient";
import { generateKeyPairSync } from "crypto";
import type { PrismaClient } from "@prisma/client";
import { createId } from "@paralleldrive/cuid2";

class RsaService {
  async getKey({ kid }: { kid: string }) {
    const rsa = await prisma.rsa.findFirst({
      where: { id: kid, isArchived: false },
    });

    return rsa;
  }
  async getLatestKey() {
    const rsa = await prisma.rsa.findFirst({
      where: { isDefault: true, isArchived: false },
    });

    if (!rsa) {
      const createdRsa = await this.generateKeys();
      return createdRsa;
    }

    return rsa;
  }
  db: PrismaClient;
  constructor(db = prisma as PrismaClient) {
    this.db = db;
  }

  async generateKeys() {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 4096,
      publicKeyEncoding: {
        type: "spki",
        format: "pem",
      },
      privateKeyEncoding: {
        type: "pkcs8",
        format: "pem",
      },
    });
    await this.db.rsa.updateMany({
      where: { isDefault: true },
      data: { isDefault: false },
    });
    const rsa = await this.db.rsa.create({
      data: {
        id: createId(),
        publicKey,
        privateKey,
        isDefault: true,
      },
    });

    return rsa;
  }
}

export default RsaService;
