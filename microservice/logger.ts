export const log = ({
  message,
  data,
  level = "debug",
}: {
  message: string;
  data?: unknown;
  level?: string;
}): void => {
  // Remove this console.log since it's in the logger itself
};
