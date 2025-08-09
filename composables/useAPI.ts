// composables/useAPI.ts
import type { UseFetchOptions } from "nuxt/app";

export function useAPI<T>(
  url: string | (() => string),
  options?: UseFetchOptions<T>
) {
  return useFetch(url, {
    ...options,
    $fetch: useNuxtApp().$api as typeof $fetch,
    // Default to client-side execution to avoid SSR caching issues
    server: options?.server ?? false,
    // Ensure unique keys if not provided to prevent unwanted caching
    key:
      options?.key ??
      `api-${typeof url === "string" ? url : url()}-${Date.now()}`,
  });
}
