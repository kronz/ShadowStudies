import SunCalc from "suncalc";
import { Forma } from "forma-embedded-view-sdk/auto";

export type SunPosition = {
  /** Sun azimuth in radians, suncalc convention: 0 = south, positive = clockwise toward west */
  azimuth: number;
  /** Sun altitude above the horizon in radians, 0 = horizon, π/2 = zenith */
  altitude: number;
};

/**
 * Computes the sun's position for a given date and geographic location.
 *
 * Uses the suncalc library which implements the equations from
 * NOAA's solar calculator, accurate to ~0.01° for dates 1901–2099.
 */
export function getSunPosition(
  date: Date,
  latitude: number,
  longitude: number,
): SunPosition {
  const pos = SunCalc.getPosition(date, latitude, longitude);
  return {
    azimuth: pos.azimuth,
    altitude: pos.altitude,
  };
}

/**
 * Convenience wrapper that fetches the project's geolocation from
 * Forma and computes the sun position for the given date.
 */
export async function getSunPositionForProject(
  date: Date,
): Promise<SunPosition> {
  const geoLocation = await Forma.project.getGeoLocation();
  if (!geoLocation) {
    throw new Error(
      "Project has no geolocation set. Sun position cannot be computed.",
    );
  }
  const [latitude, longitude] = geoLocation;
  return getSunPosition(date, latitude, longitude);
}

