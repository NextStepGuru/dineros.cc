import { setResponseHeader } from "h3";

export default defineNitroPlugin((nitroApp) => {
  const isProdDeploy = process.env.NODE_ENV === "production";
  const headers: Record<string, string> = {
    "x-frame-options": "DENY",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy":
      "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
    "content-security-policy":
      "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; img-src 'self' data: blob: https:; font-src 'self' data: https:; style-src 'self' 'unsafe-inline' https:; script-src 'self' 'unsafe-inline' https:; connect-src 'self' ws: wss: https:;",
    ...(isProdDeploy
      ? {
          "strict-transport-security":
            "max-age=63072000; includeSubDomains; preload",
        }
      : {}),
  };

  nitroApp.hooks.hook("render:response", (response, context) => {
    const event = context?.event;
    if (!event) return;
    for (const [name, value] of Object.entries(headers)) {
      setResponseHeader(event, name, value);
    }
  });
});
