/**
 * Server: forwards incoming Cookie (and other request context) to internal /api calls.
 * Client: uses $api (Bearer + 401 handling). Plain $fetch on SSR has no cookies.
 */
export function useAppFetch(): typeof $fetch {
  if (import.meta.server && !import.meta.prerender) {
    return useRequestFetch();
  }
  return useNuxtApp().$api;
}
