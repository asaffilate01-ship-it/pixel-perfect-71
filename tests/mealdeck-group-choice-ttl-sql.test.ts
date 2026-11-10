import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL(
    "../deploy/mealdeck/post-install-migrations/20261110113000_mealdeck_group_saved_choices_ttl.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("MealDeck group choice TTL migration safety", () => {
  test("all PL/pgSQL functions have complete dollar-quoted bodies", () => {
    // A malformed single-$ closing marker once made both native PostgreSQL
    // and the disposable integration workflow fail before any TTL tests ran.
    const openings = migration.match(/\bas \$\$/g) ?? [];
    const closings = migration.match(/\bend \$\$;/g) ?? [];
    expect(openings).toHaveLength(5);
    expect(closings).toHaveLength(openings.length);
    expect(migration).not.toMatch(/\bend \$;/);
    expect(migration).toContain(
      "return new;\nend $$;\ncreate trigger mealdeck_ordering_choices_saved_at",
    );
  });

  test("only unpaid collecting rooms expire, using server time and row locks", () => {
    expect(migration).toContain("for update");
    expect(migration).toContain("clock_timestamp()");
    expect(migration).toContain("r.phase<>'collecting'");
    expect(migration).toContain("r.order_id is not null");
    expect(migration).toContain("r.closed_at is not null");
    expect(migration).toContain("version=version+1");
    expect(migration).toContain("perform mealdeck_private.expire_ordering_saved_choices(p_room)");
    expect(migration).toContain("for update skip locked");
    expect(migration).toContain("choices_saved_at+interval '5 minutes'");
  });

  test("private grants stay restricted and payments are never deleted", () => {
    expect(migration).toContain("profile='mealdeck-independent-v1'");
    expect(migration).toContain("from public,anon,authenticated,service_role");
    expect(migration).not.toMatch(/delete\s+from\s+mealdeck_private\.(?:payment_orders|payment_shares|payment_collections)/i);
    expect(migration).not.toMatch(/truncate/i);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
  });
});
