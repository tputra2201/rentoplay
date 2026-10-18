import { describe, test, expect } from "bun:test";
import { validRemotePin, tvControlDocument, DEFAULT_TV_CONTROL, controlTv } from "../src/lib/tv-control";

describe("TV splash control", () => {
  test("remote PIN accepts digits 0–9 only", () => {
    expect(validRemotePin("0123")).toBe(true);
    expect(validRemotePin("098765")).toBe(true);
    expect(validRemotePin("12a4")).toBe(false);
    expect(validRemotePin("123")).toBe(false);
    expect(validRemotePin("1234567")).toBe(false);
  });
  test("release splash sends no timer or billing action", async () => {
    const originalWindow = globalThis.window, originalStorage = globalThis.localStorage;
    const target = new EventTarget(); const sent = [];
    try {
      Object.assign(globalThis, {
        window: Object.assign(target, { RenToPlayControl: { request: (id, ip, json) => {
          sent.push({ ip, data: JSON.parse(json) });
          target.dispatchEvent(new CustomEvent("rentoplay:tv-control-result", { detail: { id, result: { ok: true } } }));
        } } }),
        localStorage: { getItem: key => JSON.stringify(key === "rentoplay.tvIps" ? { a: "192.168.80.22" } : { a: { token: "paired", pin: "0123" } }) },
      });
      await controlTv("a", "releaseSplash");
      expect(sent).toEqual([{ ip: "192.168.80.22", data: { action: "releaseSplash", token: "paired" } }]);
    } finally { Object.assign(globalThis, { window: originalWindow, localStorage: originalStorage }); }
  });
  test("PIN change and welcome settings reach TV only through configure", () => {
    const settings = { ...DEFAULT_TV_CONTROL, token: "paired", pin: "0123", splashOnWake: true };
    expect(JSON.parse(tvControlDocument(settings, "configure")).pin).toBe("0123");
    expect(JSON.parse(tvControlDocument(settings, "configure")).enabled).toBe(true);
    expect(JSON.parse(tvControlDocument(settings, "status")).pin).toBeUndefined();
    expect(() => tvControlDocument({ ...settings, pin: "12xx" }, "configure")).toThrow();
  });
});