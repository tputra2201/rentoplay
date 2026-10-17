import { expect, test } from "bun:test";
import { thermalBlankLines, thermalCutText, printViaAndroid, printViaRawBt } from "../src/lib/printing";
import { escposBytes } from "../src/lib/escpos";

const printer = { paper: "80mm", autoCut: true, bluetoothAddress: "printer" };
const tail = "\n\n\n\x1d\x56\x42\x00";

test("every thermal document uses a line terminator plus two blank lines before cutter", () => {
  for (const role of ["receipt", "invoice", "report", "kitchen", "bar"]) {
    expect(thermalBlankLines({ ...printer, role })).toBe(2);
    expect(thermalCutText("TOTAL 100000\n\n", thermalBlankLines({ ...printer, role }))).toBe("TOTAL 100000" + tail);
  }
});

test("Android, RawBT and direct bytes carry the same two-blank-line cut tail", () => {
  const originalWindow = globalThis.window;
  const sent = [];
  try {
    globalThis.window = { location: { href: "" }, BillingAndroid: { printBase64: (address, payload) => sent.push(atob(payload)) } };
    printViaAndroid(printer, "TOTAL 100000\n");
    printViaRawBt(printer, "TOTAL 100000\n");
    expect(sent[0]).toBe("TOTAL 100000" + tail);
    expect(atob(window.location.href.replace("rawbt:base64,", ""))).toBe(sent[0]);
    const direct = escposBytes("TOTAL 100000\n", { blankLines: thermalBlankLines(printer) });
    expect(new TextDecoder().decode(direct).endsWith(sent[0])).toBe(true);
  } finally { globalThis.window = originalWindow; }
});