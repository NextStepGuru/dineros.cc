import { dateTimeService } from "~/server/services/forecast/DateTimeService";

/** Parse optional admin query date bounds; invalid or ambiguous strings yield `undefined`. */
export function parseOptionalIsoQuery(s: string | undefined): Date | undefined {
  if (!s?.trim()) return undefined;
  try {
    return dateTimeService.parseInput(s.trim()).toDate();
  } catch {
    return undefined;
  }
}
