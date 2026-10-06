import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("database isolates accounts and rejects stale saves", { timeout: 20000 }, async () => {
  const db = new PGlite();
  await db.waitReady;
  const a = "11111111-1111-4111-8111-111111111111";
  const b = "22222222-2222-4222-8222-222222222222";
  try {
    await db.exec(`
      create role authenticated;
      create role anon;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated, anon;
      insert into auth.users values ('${a}'), ('${b}');
    `);
    await db.exec(await readFile(new URL("../supabase/setup.sql", import.meta.url), "utf8"));
    await db.exec(`set role authenticated; set request.jwt.claim.sub = '${a}';`);
    const payload = JSON.stringify({ sets: [{ id: "mine", name: "My cards", cards: [], progress: {} }] });
    const save = (user, version) => db.query(
      "select public.save_flashcard_state($1::uuid, $2::bigint, $3::jsonb) as result",
      [user, version, payload],
    );
    const first = await save(a, 0);
    assert.equal(first.rows[0].result.version, 1);
    assert.equal((await db.query("select * from public.flashcard_states")).rows.length, 1);
    await assert.rejects(save(a, 0), (error) => error.code === "40001");
    assert.equal((await save(a, 1)).rows[0].result.version, 2);
    await assert.rejects(save(a, 1), (error) => error.code === "40001");

    await db.exec(`set request.jwt.claim.sub = '${b}';`);
    assert.equal((await db.query("select * from public.flashcard_states")).rows.length, 0);
    await assert.rejects(save(a, 2), (error) => error.code === "42501");
    await assert.rejects(db.query(
      "insert into public.flashcard_states(user_id, state) values ($1::uuid, $2::jsonb)",
      [a, payload],
    ), (error) => error.code === "42501");
    assert.equal((await save(b, 0)).rows[0].result.version, 1);
    const ownRows = (await db.query("select user_id from public.flashcard_states")).rows;
    assert.deepEqual(ownRows, [{ user_id: b }]);

    await db.exec("reset role; set role anon; set request.jwt.claim.sub = '';");
    await assert.rejects(db.query("select * from public.flashcard_states"), (error) => error.code === "42501");
    await assert.rejects(save(a, 2), (error) => error.code === "42501");
  } finally { await db.close(); }
});
