import { describe, expect, it } from "vitest";
import { collectDoctorCiFailReasons } from "../../src/interfaces/cli/doctor-ci-guards.js";

describe("collectDoctorCiFailReasons", () => {
  const sqliteOk = { ok: true as const };

  it("returns empty when report is healthy", () => {
    expect(
      collectDoctorCiFailReasons(
        {
          ok: true,
          duplicate_dedupe_keys_count: 0,
          stale_running_count: 0,
          heartbeat_missing_count: 0,
          review_overdue_count: 0,
        },
        sqliteOk,
        "sqlite",
      ),
    ).toEqual([]);
  });

  it("flags dedupe collisions", () => {
    const r = collectDoctorCiFailReasons(
      {
        ok: true,
        duplicate_dedupe_keys_count: 1,
        stale_running_count: 0,
        heartbeat_missing_count: 0,
        review_overdue_count: 0,
      },
      sqliteOk,
      "sqlite",
    );
    expect(r.some((x) => x.includes("dedupe"))).toBe(true);
  });

  it("flags sqlite probe when storage is sqlite", () => {
    const r = collectDoctorCiFailReasons(
      {
        ok: true,
        duplicate_dedupe_keys_count: 0,
        stale_running_count: 0,
        heartbeat_missing_count: 0,
        review_overdue_count: 0,
      },
      { ok: false, hint: "broken" },
      "sqlite",
    );
    expect(r.some((x) => x.includes("sqlite"))).toBe(true);
  });

  it("ignores sqlite probe for jsonl storage", () => {
    expect(
      collectDoctorCiFailReasons(
        {
          ok: true,
          duplicate_dedupe_keys_count: 0,
          stale_running_count: 0,
          heartbeat_missing_count: 0,
          review_overdue_count: 0,
        },
        { ok: false, hint: "broken" },
        "jsonl",
      ),
    ).toEqual([]);
  });
});
