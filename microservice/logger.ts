export const log = ({
  message: _message,
  data: _data,
  level: _level = "debug",
}: {
  message: string;
  data?: unknown;
  level?: string;
}): void => {
  // Remove this console.log since it's in the logger itself
};
