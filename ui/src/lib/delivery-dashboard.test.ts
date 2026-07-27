import { describe, expect, it } from "vitest";
import { getWorkloadLevel } from "./delivery-dashboard";

describe("getWorkloadLevel", () => {
  it("keeps an idle resource meter empty", () => {
    expect(getWorkloadLevel(0)).toBe(0);
  });

  it("caps active workload at four bars", () => {
    expect(getWorkloadLevel(6)).toBe(4);
  });

  it("marks unavailable resources as requiring intervention", () => {
    expect(getWorkloadLevel(0, true)).toBe(4);
  });
});
