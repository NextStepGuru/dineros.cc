export function useNotificationCount() {
  return useState<number>("notification-count", () => 0);
}
