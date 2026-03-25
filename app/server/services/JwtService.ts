import jwt from "jsonwebtoken";
import { prisma } from "~/server/clients/prismaClient";
import { createId } from "@paralleldrive/cuid2";
import RsaService from "./RsaService";

class JwtService {
  // constructor() {}

  async sign({ userId }: { userId: number }): Promise<string> {
    const rsaService = new RsaService();
    const rsa = await rsaService.getLatestKey();

    let user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user?.jwtKey) {
      user = await prisma.user.update({
        where: { id: userId },
        data: {
          jwtKey: createId(),
        },
      });
    }
    const token = jwt.sign(
      {
        userId: userId,
        jwtKey: user.jwtKey,
      },
      rsa.privateKey,
      {
        keyid: rsa.id,
        algorithm: "PS512",
        expiresIn: "24h",
      }
    );

    return token;
  }

  async verify(token: string): Promise<string | jwt.JwtPayload> {
    const rsaService = new RsaService();
    const data = jwt.decode(token, { complete: true });
    const kid = data?.header?.kid;
    const jwtKey: string | null =
      data && typeof data.payload === "object" && "jwtKey" in data.payload
        ? data.payload.jwtKey
        : null;

    if (!kid || !jwtKey) {
      throw new Error("Invalid token header");
    }

    const rsa = await rsaService.getKey({ kid });
    if (!rsa) {
      throw new Error("Invalid or expired session");
    }

    const decoded = jwt.verify(token, rsa.publicKey);

    await prisma.user.findUniqueOrThrow({
      where: { jwtKey },
    });

    return decoded;
  }
}

export default JwtService;
