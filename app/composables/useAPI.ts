// composables/useAPI.ts
import type { UseFetchOptions } from "nuxt/app";

export function useAPI<T>(
  url: string | (() => string),
  options?: UseFetchOptions<T>
) {
  const method = String(options?.method ?? "GET").toUpperCase();
  const fallbackKey =
    typeof url === "string" ? `api-${method}-${url}` : undefined;

  return useFetch(url, {
    ...options,
    $fetch: useNuxtApp().$api as typeof $fetch,
    // Default to client-side execution to avoid SSR caching issues
    server: options?.server ?? false,
    // Keep keys stable to preserve dedupe/cache behavior.
    key: options?.key ?? fallbackKey,
  });
}
