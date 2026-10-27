import assert from "node:assert/strict";

export async function testSecurityMetadata(db) {
  const tables = await db.query(`
    select n.nspname, c.relname, c.relrowsecurity,
      has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') as anon_access,
      has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE') as member_write
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind='r' and (n.nspname='quiz_private' or
      (n.nspname='public' and c.relname like 'quiz_%'))
  `);
  assert.equal(tables.rows.length, 8);
  for (const t of tables.rows) {
    assert.equal(t.relrowsecurity, true, `${t.relname}: RLS`);
    assert.equal(t.anon_access, false, `${t.relname}: anon denied`);
    assert.equal(t.member_write, false, `${t.relname}: direct writes denied`);
  }
  const functions = await db.query(`
    select n.nspname, p.proname, p.prosecdef, p.proconfig,
      has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
      has_function_privilege('authenticated',p.oid,'EXECUTE') as member_execute
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='quiz_private' or (n.nspname='public' and
      p.proname in ('create_quiz_room','join_quiz_room','get_quiz_room',
      'quiz_room_heartbeat','set_quiz_room_joining','control_quiz_buzzer',
      'submit_quiz_buzz','manage_quiz_competition')))
  `);
  assert.ok(functions.rows.length >= 12);
  for (const f of functions.rows) {
    if (f.prosecdef)
      assert.ok(
        f.proconfig?.includes('search_path=""'),
        `${f.proname}: safe search path`,
      );
    assert.equal(f.anon_execute, false, `${f.proname}: anon execute denied`);
    if (f.nspname === "quiz_private" && f.proname !== "has_room_access")
      assert.equal(
        f.member_execute,
        false,
        `${f.proname}: private execute denied`,
      );
  }
  console.log(
    `PASS security metadata: ${tables.rows.length} RLS tables, restricted DML and ${functions.rows.length} function ACL/search-path checks`,
  );
}
