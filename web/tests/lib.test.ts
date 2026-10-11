import { describe, expect, it } from "vitest";
import { scheduleError } from "@/lib/types";
import { mockEngagement } from "@/lib/engagement";
import { templateSvg } from "@/lib/images";

describe("scheduleError", () => {
  const now = new Date("2026-11-01T10:00:00Z");
  const at = (min: number) => new Date(now.getTime() + min * 60000);

  it("enforces Facebook's 10 minute minimum in Real mode", () => {
    expect(scheduleError("facebook", false, at(5), now)).toMatch(/10 minutes/);
    expect(scheduleError("facebook", false, at(15), now)).toBeNull();
  });

  it("allows short delays in Mock mode", () => {
    expect(scheduleError("facebook", true, at(2), now)).toBeNull();
  });

  it("refuses dates too far ahead", () => {
    expect(scheduleError("linkedin", false, at(31 * 24 * 60), now)).toMatch(/30 days/);
  });
});

describe("mockEngagement", () => {
  it("grows over time and is stable for the same moment", () => {
    const post = { id: "abc", publishedAt: "2026-11-01T10:00:00Z" };
    const early = mockEngagement(post, new Date("2026-11-01T10:01:00Z"));
    const later = mockEngagement(post, new Date("2026-11-01T10:30:00Z"));
    expect(later.likes).toBeGreaterThan(early.likes);
    expect(mockEngagement(post, new Date("2026-11-01T10:30:00Z"))).toEqual(later);
  });
});

describe("templateSvg", () => {
  it("escapes text from the brief", () => {
    const svg = templateSvg("Fun & <games>", "14 Nov", "School \"A\"");
    expect(svg).toContain("Fun &amp; &lt;games&gt;");
    expect(svg).not.toContain("<games>");
  });
});
