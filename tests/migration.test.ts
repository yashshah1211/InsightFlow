import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, expect, it } from 'vitest';
let db: PGlite;
const owner = '11111111-1111-4111-8111-111111111111';
const stranger = '22222222-2222-4222-8222-222222222222';
const demo = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const privateWorkspace = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const batch = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const demoBatch = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const issue = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const hash = 'a'.repeat(64);
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);
  await db.exec(readFileSync('supabase/migrations/202610110001_foundation.sql', 'utf8'));
  await db.query('insert into auth.users(id) values ($1), ($2)', [owner, stranger]);
  await db.query('insert into public.workspaces(id, owner_id, is_demo) values ($1, null, true), ($2, $3, false)', [demo, privateWorkspace, owner]);
  await db.query(`insert into public.import_batches(id, workspace_id, owner_id, filename, source, content_hash) values
    ($1, $2, $3, 'private.csv', 'upload', $4), ($5, $6, null, 'demo.csv', 'fixture', $4)`, [batch, privateWorkspace, owner, hash, demoBatch, demo]);
  await db.query(`insert into public.feedback_patterns(workspace_id, import_batch_id, normalized_hash, normalized_text, example_original_text, occurrence_count, category_counts)
    values ($1, $2, $3, 'text', 'text', 1, '{}')`, [privateWorkspace, batch, hash]);
  await db.query(`insert into public.issues(id, workspace_id, title, category, severity, summary) values ($1, $2, 'Test issue', 'Product Feedback', 'high', 'evidence')`, [issue, privateWorkspace]);
}, 30000);
afterAll(async () => { await db?.close(); });
async function asRole(role: 'anon' | 'authenticated', user: string | null, operation: () => Promise<void>) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user ?? '']);
  await db.exec(`set role ${role}`);
  try { await operation(); } finally { await db.exec('reset role'); }
}
it('migration applies and all nine domain tables have RLS enabled', async () => {
  const result = await db.query<{ count: number }>(`select count(*)::int as count from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity`);
  expect(result.rows[0].count).toBe(9);
});
it('anonymous can read demo batches only and cannot insert/update/delete global data', async () => {
  await asRole('anon', null, async () => {
    const r = await db.query<{ id: string }>('select id from public.import_batches');
    expect(r.rows.map(row => row.id)).toEqual([demoBatch]);
    await expect(db.query(`update public.import_batches set filename='evil' where id=$1`, [demoBatch])).rejects.toThrow(/permission denied/);
    await expect(db.query('delete from public.workspaces where id=$1', [demo])).rejects.toThrow(/permission denied/);
    await expect(db.exec(`insert into public.workspaces(is_demo) values (true)`)).rejects.toThrow(/permission denied/);
  });
});
it('owners read their scope plus demo; other authenticated users cannot see private evidence', async () => {
  await asRole('authenticated', owner, async () => {
    const r = await db.query<{ id: string }>('select id from public.import_batches order by id');
    expect(r.rows.map(row => row.id)).toEqual([batch, demoBatch]);
    expect((await db.query('select * from public.feedback_patterns')).rows).toHaveLength(1);
    await expect(db.exec(`update public.issues set status='resolved'`)).rejects.toThrow(/permission denied/);
  });
  await asRole('authenticated', stranger, async () => {
    expect((await db.query('select * from public.feedback_patterns')).rows).toHaveLength(0);
    expect((await db.query('select * from public.issues')).rows).toHaveLength(0);
  });
});
it('cross-workspace evidence linkage is rejected even for privileged writes', async () => {
  await expect(db.query(`insert into public.issue_evidence(workspace_id, issue_id, import_batch_id, normalized_hash, role) values ($1,$2,$3,$4,'supporting')`, [demo, issue, batch, hash])).rejects.toThrow(/foreign key/);
});
it('batch retry content is unique within a workspace and owner spoofing is rejected', async () => {
  await expect(db.query(`insert into public.import_batches(workspace_id,owner_id,filename,source,content_hash) values ($1,$2,'retry.csv','upload',$3)`, [privateWorkspace, owner, hash])).rejects.toThrow(/unique/);
  await expect(db.query(`insert into public.import_batches(workspace_id,owner_id,filename,source,content_hash) values ($1,$2,'spoof.csv','upload',$3)`, [privateWorkspace, stranger, 'b'.repeat(64)])).rejects.toThrow(/owner mismatch/);
});
