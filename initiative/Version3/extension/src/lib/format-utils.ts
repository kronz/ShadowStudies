import { Forma } from "forma-embedded-view-sdk/auto";
import { DateTime } from "luxon";

const SQ_METERS_TO_SQ_FEET = 10.7639;

let cachedFormatter: ((sqMeters: number) => string) | null = null;
let cachedTimezone: string | null = null;

/**
 * Returns a formatting function that converts square meters to the
 * project's presentation unit system (metric m² or imperial ft²).
 * The result is cached after the first call.
 */
export async function getAreaFormatter(): Promise<(sqMeters: number) => string> {
  if (cachedFormatter) return cachedFormatter;

  try {
    const system = await Forma.getPresentationUnitSystem();
    if (system === "imperial") {
      cachedFormatter = (sqM) =>
        `${Math.round(sqM * SQ_METERS_TO_SQ_FEET).toLocaleString()} ft²`;
    } else {
      cachedFormatter = (sqM) => `${Math.round(sqM).toLocaleString()} m²`;
    }
  } catch {
    cachedFormatter = (sqM) => `${Math.round(sqM).toLocaleString()} m²`;
  }

  return cachedFormatter;
}

/**
 * Formats a Date in the project's timezone (matching what Forma shows
 * in-canvas) rather than the browser's local timezone.
 */
export async function formatTimeInProjectTz(date: Date): Promise<string> {
  if (!cachedTimezone) {
    try {
      const tz = await Forma.project.getTimezone();
      cachedTimezone = tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      cachedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    }
  }
  return DateTime.fromJSDate(date, { zone: cachedTimezone || undefined }).toFormat("HH:mm");
}
