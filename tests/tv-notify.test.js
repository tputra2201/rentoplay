import { describe, expect, test } from "bun:test";
import { canReleaseStation, releaseAfterTimeChange, releaseStationScreen, tvSchedulePayload, tvConfig, DEFAULT_TV_CONFIG } from "../src/lib/tv-notify";
import { removeSolidBackground } from "../src/lib/logo-image";

test("adding time releases the TV screen; reducing time does not", () => {
  expect(releaseAfterTimeChange(1)).toBe(true);
  expect(releaseAfterTimeChange(60)).toBe(true);
  expect(releaseAfterTimeChange(0)).toBe(false);
  expect(releaseAfterTimeChange(-30)).toBe(false);
});

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

test("default reminders run at 10, 5 and 2 minutes", () => {
  const payload = JSON.parse(tvSchedulePayload(DEFAULT_TV_CONFIG, "Station", 123456, "", "Store"));
  expect(payload.stages.map((s) => s.sec)).toEqual([600, 300, 120, 0]);
});

test("custom reminder title and three lines reach the schedule with minute substitution", () => {
  const cfg = { ...DEFAULT_TV_CONFIG, stages: [{ minutes: 5, title: "SISA {menit}", message: "legacy", messageLines: ["Baris {menit}", "", "Hubungi kasir"] }], endMessageLines: ["Selesai", "Hubungi kasir", "Terima kasih"] };
  const payload = JSON.parse(tvSchedulePayload(cfg, "Station", 123456, "", "Store"));
  expect(payload.stages[0].title).toBe("SISA 5");
  expect(payload.stages[0].message).toBe("Baris 5\nHubungi kasir");
  const oneLine = JSON.parse(tvSchedulePayload({ ...cfg, stages: [{ minutes: 10, message: "x", messageLines: ["Sisa 10 menit", "", ""] }] }, "Station", 1, "", "Store"));
  expect(oneLine.stages[0].message).toBe("Sisa 10 menit");
  expect(payload.stages[1].message).toBe("Selesai\nHubungi kasir\nTerima kasih");
});

test("legacy saved end message is retained rather than overwritten by new defaults", () => {
  const w = globalThis.window, s = globalThis.localStorage;
  try {
    Object.assign(globalThis, { window: {}, localStorage: { getItem: () => JSON.stringify({ endMessage: "Pesan lama" }) } });
    expect(tvConfig().endMessageLines).toEqual(["Pesan lama", "", ""]);
  } finally { Object.assign(globalThis, { window: w, localStorage: s }); }
});

test("background removal preserves enclosed white details and foreground colors", () => {
  const pixels = new Uint8ClampedArray(5 * 5 * 4).fill(255);
  for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) {
    if (x === 2 && y === 2) continue;
    pixels.set([20, 80, 140, 255], (y * 5 + x) * 4);
  }
  expect(removeSolidBackground(pixels, 5, 5)).toBe(true);
  expect(pixels[3]).toBe(0);
  expect([...pixels.slice(24, 28)]).toEqual([20, 80, 140, 255]);
  expect([...pixels.slice(48, 52)]).toEqual([255, 255, 255, 255]);
});

test("transparent logo border is not mistaken for a removable solid background", () => {
  const pixels = new Uint8ClampedArray(3 * 3 * 4);
  pixels.set([255, 255, 255, 255], 16);
  expect(removeSolidBackground(pixels, 3, 3)).toBe(false);
  expect(pixels[19]).toBe(255);
});