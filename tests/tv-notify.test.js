import { describe, expect, test } from "bun:test";
import { canReleaseStation, releaseStationScreen, tvSchedulePayload, DEFAULT_TV_CONFIG } from "../src/lib/tv-notify";

describe("Station Release", () => {
  test("only timed sessions whose time has expired can be released", () => {
    expect(canReleaseStation("package", 1)).toBe(false);
    expect(canReleaseStation("package", 0)).toBe(true);
    expect(canReleaseStation("package", -60)).toBe(true);
    expect(canReleaseStation("open", 0)).toBe(false);
    expect(canReleaseStation(undefined, 0)).toBe(false);
  });
  test("sends dismiss only to the chosen station", () => {
    const sent = [];
    const originalWindow = globalThis.window;
    const originalStorage = globalThis.localStorage;
    try {
      Object.assign(globalThis, {
        window: { RenToPlayTV: { dismiss: (ip) => sent.push(ip) } },
        localStorage: { getItem: () => JSON.stringify({ a: "192.168.80.75", b: "192.168.80.76" }) },
      });
      expect(releaseStationScreen("a")).toBe("sent");
      expect(sent).toEqual(["192.168.80.75"]);
      expect(releaseStationScreen("missing")).toBe("no-ip");
      expect(sent).toHaveLength(1);
    } finally {
      Object.assign(globalThis, { window: originalWindow, localStorage: originalStorage });
    }
  });
});

test("store logo is preserved in fullscreen time-up schedules", () => {
  const logo = "data:image/png;base64,aGVsbG8=";
  const payload = JSON.parse(tvSchedulePayload(DEFAULT_TV_CONFIG, "Station 1", 123456, logo, "Store"));
  expect(payload.logo).toBe(logo);
  expect(payload.block).toBe(true);
  expect(payload.stages.at(-1).sec).toBe(0);
});