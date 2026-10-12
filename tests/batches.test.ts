import { beforeAll, afterAll, beforeEach, afterEach, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { BatchesResponse } from '@/lib/contracts/batches';
import { HttpError } from '@/lib/db/errors';
const mock = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock('@/lib/db/auth', () => ({ requireSession: mock.session }));
import { GET } from '@/app/api/batches/route';
const owner = '11111111-1111-4111-8111-111111111111';
const stranger = '22222222-2222-4222-8222-222222222222';
const ids = ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'];
let db: PGlite;
let actor = owner;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
  await db.exec(readFileSync('supabase/migrations/202610110001_foundation.sql', 'utf8'));
  await db.query('insert into auth.users values ($1),($2)', [owner, stranger]);
  await db.query(`insert into public.workspaces(id,owner_id,is_demo) values ($1,$1,false),($2,$2,false),($3,null,true)`, [owner, stranger, ids[2]]);
  for (let index = 0; index < 3; index++) await db.query(`insert into public.import_batches(id,workspace_id,owner_id,filename,source,content_hash,record_count,unique_text_count,status,created_at)
    values ($1,$2,$3,$4,$5,$6,3,2,'ready','2026-10-11T00:00:00Z')`, [ids[index], index === 2 ? ids[2] : owner, index === 2 ? null : owner, `batch-${index}.csv`, index === 2 ? 'fixture' : 'upload', String(index).repeat(64)]);
}, 30000);
afterAll(async () => { await db?.close(); });
afterEach(() => vi.unstubAllEnvs());
// PostgREST transport double translates the handler's predicates to actual SQL under RLS.
function client() {
  return { from(table: string) {
    expect(table).toBe('import_batches');
    const filters: { name: string; value: unknown }[] = [];
    const chain = {
      select: (columns: string, options: unknown) => { expect(columns).not.toContain('owner'); expect(options).toEqual({ count: 'exact' }); return chain; },
      eq: (name: string, value: unknown) => { filters.push({ name, value }); return chain; },
      in: (name: string, values: string[]) => { expect(name).toBe('source'); expect(values).toEqual(['upload', 'manual']); return chain; },
      order: (name: string, options: unknown) => { expect(['created_at', 'id']).toContain(name); expect(options).toEqual({ ascending: false }); return chain; },
      range: async (start: number, end: number) => {
        expect(filters.find(item => item.name === 'owner_id')?.value).toBe(actor);
        expect(filters.find(item => item.name === 'status')?.value).toBe('ready');
        await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
        await db.exec('set role authenticated');
        try {
          const where = filters.map((item, index) => `${item.name}=$${index + 1}`).join(' and ') + " and source in ('upload','manual')";
          const values = filters.map(item => item.value);
          const { rows } = await db.query<Record<string, unknown>>(`select id,filename,source,record_count,unique_text_count,rejected_count,created_at::text from import_batches where ${where} order by created_at desc,id desc limit $${values.length + 1} offset $${values.length + 2}`, [...values, end - start + 1, start]);
          const count = await db.query<{ total: number }>(`select count(*)::int as total from import_batches where ${where}`, values);
          return { data: rows.map(row => ({ ...row, created_at: new Date(row.created_at as string).toISOString() })), count: count.rows[0].total, error: null };
        } finally { await db.exec('reset role'); }
      },
    };
    return chain;
  } };
}
beforeEach(() => { actor = owner; mock.session.mockReset(); mock.session.mockResolvedValue({ client: client(), userId: actor }); });
const request = (query = '') => new Request('https://app.example/api/batches' + query);
it('unauthenticated/unconfigured discovery returns a safe 401 envelope', async () => {
  mock.session.mockRejectedValue(new HttpError(401, 'UNAUTHENTICATED', 'Sign in to access your private workspace'));
  const response = await GET(request()); expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to access your private workspace' } });
  expect(response.headers.get('cache-control')).toContain('no-store');
});
it('owned ready batches have real counts/time and deterministic pagination; demo excluded', async () => {
  const response = await GET(request('?pageSize=1'));
  expect(response.headers.get('cache-control')).toContain('private');
  const body = BatchesResponse.parse(await response.json());
  expect(body.data.items[0]).toEqual({ id: ids[1], filename: 'batch-1.csv', source: 'upload', recordCount: 3, uniqueTextCount: 2, rejectedCount: 0, createdAt: '2026-10-11T00:00:00.000Z' });
  expect(body.meta).toEqual({ contractVersion: 'batches-1.0.0', page: 1, pageSize: 1, total: 2, totalPages: 2 });
  expect((await (await GET(request('?pageSize=1&page=2'))).json()).data.items[0].id).toBe(ids[0]);
});
it('authenticated empty results and foreign ID lookup disclose no owner or existence', async () => {
  actor = stranger; mock.session.mockResolvedValue({ client: client(), userId: actor });
  for (const suffix of ['', `?batchId=${ids[0]}`]) {
    const body = BatchesResponse.parse(await (await GET(request(suffix))).json());
    expect(body.data.items).toEqual([]); expect(body.meta.total).toBe(0); expect(body.meta.totalPages).toBe(0);
  }
});
it('RLS independently prevents cross-user enumeration even with a spoofed owner filter', async () => {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [stranger]);
  await db.exec('set role authenticated');
  try { expect((await db.query('select id from import_batches where owner_id=$1', [owner])).rows).toEqual([]); }
  finally { await db.exec('reset role'); }
});
it('strict queries reject duplicate/unknown/spoofed identity and unbounded sizes', async () => {
  for (const suffix of ['?page=1&page=2', '?owner_id=' + stranger, '?pageSize=101', '?page=0', '?batchId=invalid']) expect((await GET(request(suffix))).status).toBe(400);
});
it('database failures are sanitized without a success envelope', async () => {
  mock.session.mockResolvedValue({ userId: owner, client: { from: () => { throw new Error('private transport details'); } } });
  const response = await GET(request()); expect(response.status).toBe(500);
  expect(await response.text()).not.toContain('private transport details');
});
