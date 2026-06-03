import type { PoolConfig } from "mariadb";

/**
 * Builds PrismaMariaDb pool config. For Kubernetes cluster DNS and local dev,
 * TLS is disabled so the mariadb driver does not negotiate TLS against Bitnami
 * MySQL (self-signed CA), which can stall until pool acquire timeout.
 *
 * Set MARIADB_FORCE_TLS=1 to keep URL passthrough for *.svc.cluster.local.
 */
export function prismaMariaDbPoolConfig(databaseUrl: string): string | PoolConfig {
  try {
    const trimmed = databaseUrl.trim();
    if (!/^(mysql|mariadb):/i.test(trimmed)) {
      return databaseUrl;
    }
    const parsed = new URL(trimmed.replace(/^(mysql|mariadb):/i, "http:"));

    const host = parsed.hostname;
    const skipTls =
      process.env.MARIADB_FORCE_TLS !== "1" &&
      process.env.MARIADB_FORCE_TLS !== "true" &&
      (host.endsWith(".svc.cluster.local") ||
        host === "localhost" ||
        host === "127.0.0.1");

    if (!skipTls) {
      return databaseUrl;
    }

    const dbName = parsed.pathname.replace(/^\//, "");
    const cfg: PoolConfig = {
      host,
      port: parsed.port ? Number(parsed.port) : 3306,
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      ssl: false,
      allowPublicKeyRetrieval: true,
      prepareCacheLength: 0,
    };
    if (dbName) {
      cfg.database = dbName;
    }
    return cfg;
  } catch {
    return databaseUrl;
  }
}
