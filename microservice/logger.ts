export const log = ({
  message,
  data,
  level = "debug",
}: {
  message: string;
  data?: unknown;
  level?: string;
}): void => {
  console.log({ message, data, level });
};
