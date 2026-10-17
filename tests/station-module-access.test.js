import { expect, test } from "bun:test";
import { stationModuleAccess } from "../src/lib/station-module-access";

test("disabled Cafe prevents new station food orders and table linking", () => {
  const access = stationModuleAccess({ cafe: false }, false, false);
  expect(access.canOrderCafe).toBe(false);
  expect(access.canLinkCafeTable).toBe(false);
  expect(access.showOrderTab).toBe(false);
});

test("legacy stores without module settings retain Cafe access", () => {
  expect(stationModuleAccess(undefined, false, false).canOrderCafe).toBe(true);
});

test("disabling Cafe does not remove access to rental add-ons", () => {
  expect(stationModuleAccess({ cafe: false }, true, false).showOrderTab).toBe(true);
});

test("existing food bills remain accessible without allowing new orders", () => {
  const access = stationModuleAccess({ cafe: false }, false, true);
  expect(access.showOrderTab).toBe(true);
  expect(access.canOrderCafe).toBe(false);
});