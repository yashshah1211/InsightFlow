import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, beforeEach, afterEach, expect, it, vi } from 'vitest';
import { POST as manual } from '@/app/api/feedback/route';
import { POST as upload } from '@/app/api/feedback/import/route';
import { GET as detail, PATCH as patch } from '@/app/api/issues/[id]/route';
import { POST as action } from '@/app/api/issues/[id]/actions/route';
import { GET as dashboard } from '@/app/api/dashboard/route';
import { ManualFeedbackResponse, ImportResponse, IssueDetailResponse, IssuePatchResponse, ActionResponse, DashboardResponse } from '@/lib/contracts';
import { HttpError } from '@/lib/db/errors';
const auth = vi.hoisted(() => ({ requireSession: vi.fn() }));
vi.mock('@/lib/db/auth', () => auth);
const owner='11111111-1111-4111-8111-111111111111', stranger='22222222-2222-4222-8222-222222222222';
let db:PGlite;
let actor:string|null=owner;
const client = { rpc: async (name:string,args:Record<string,unknown>) => {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor ?? '']);
  await db.exec('set role authenticated');
  try {
    const names=Object.keys(args), values=Object.values(args);
    const result=await db.query<{result:unknown}>(`select public.${name}(${names.map((key,i)=>key+' => $'+(i+1)).join(',')}) as result`,values);
    return {data:result.rows[0].result,error:null};
  } catch(error) { return {data:null,error:{code:(error as {code:string}).code}}; }
  finally { await db.exec('reset role'); }
} };
beforeAll(async()=>{
  db=new PGlite();
  await db.exec("create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema public,auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;");
  await db.exec(readFileSync('supabase/migrations/202610110001_foundation.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/202610110002_authenticated_rpcs.sql','utf8'));
  await db.query('insert into auth.users(id) values($1),($2)',[owner,stranger]);
},30000);
afterAll(async()=>db?.close());
beforeEach(()=>{
  actor=owner;
  vi.stubEnv('INSIGHTFLOW_DATA_MODE','fixture');
  vi.stubEnv('INSIGHTFLOW_WRITES_ENABLED','true');
  auth.requireSession.mockResolvedValue({client,userId:owner});
});
afterEach(()=>vi.unstubAllEnvs());
const req=(body:unknown,url='http://localhost/api/feedback')=>new Request(url,{method:'POST',headers:{'content-type':'application/json',origin:'http://localhost'},body:JSON.stringify(body)});
it('configured manual add persists, reads back, updates issue and saves action with frozen contracts',async()=>{
  const r=await manual(req({review:'Delivery was delayed but support was helpful.',category:'Customer Service'}));
  expect(r.status).toBe(200);
  const body=ManualFeedbackResponse.parse(await r.json());
  expect(body.data.observedAt).toBeNull();
  const overview=await dashboard(new Request('http://localhost/api/dashboard?batchId='+body.meta.batchId));
  const summary=DashboardResponse.parse(await overview.json());
  expect(summary.data.summary.recordCount).toBe(1);
  const issue=summary.data.topIssues[0];
  const ctx={params:Promise.resolve({id:issue.id})};
  const changed=await patch(req({status:'investigating',notes:'Verified case'}),ctx);
  expect(changed.status).toBe(200);
  expect(IssuePatchResponse.parse(await changed.json()).data.status).toBe('investigating');
  const saved=await action(req({description:'Trace shipment'}),ctx);
  expect(saved.status).toBe(200);
  expect(ActionResponse.parse(await saved.json()).data.issueId).toBe(issue.id);
  const detailResponse=await detail(new Request('http://localhost/api/issues/'+issue.id),ctx);
  const result=IssueDetailResponse.parse(await detailResponse.json());
  expect(result.data.issue.notes).toBe('Verified case');
  expect(result.data.actions).toHaveLength(1);
  expect(result.data.evidence[0].samples[0].rawText).toContain('support was helpful');
});
function csvReq(text:string){
  const form=new FormData(); form.append('file',new File([text],'test.csv',{type:'text/csv'}));
  return new Request('http://localhost/api/feedback/import',{method:'POST',headers:{origin:'http://localhost'},body:form});
}
it('CSV imports atomically retain raw duplicates, reject invalid rows and replay identical bytes',async()=>{
  const text='review,category\nI was not a victim of fraud.,Fraud and Scam\nI was not a victim of fraud.,Fraud and Scam\n,Product Feedback';
  const first=ImportResponse.parse(await (await upload(csvReq(text))).json());
  const retry=ImportResponse.parse(await (await upload(csvReq(text))).json());
  expect(first.data).toMatchObject({recordCount:2,uniqueTextCount:1,repeatedRecordCount:1,rejectedCount:1,idempotentReplay:false});
  expect(retry.data.batchId).toBe(first.data.batchId);
  expect(retry.data.idempotentReplay).toBe(true);
  const result=DashboardResponse.parse(await (await dashboard(new Request('http://localhost/api/dashboard?batchId='+first.data.batchId))).json());
  expect(result.data.topIssues).toEqual([]);
  expect(result.data.summary.timestampCoverage.covered).toBe(0);
});
it('different authenticated user cannot read/update/create actions for another workspace',async()=>{
  const added=ManualFeedbackResponse.parse(await (await manual(req({review:'The product is defective.',category:'Product Feedback'}))).json());
  const before=DashboardResponse.parse(await (await dashboard(new Request('http://localhost/api/dashboard?batchId='+added.meta.batchId))).json());
  const ctx={params:Promise.resolve({id:before.data.topIssues[0].id})};
  actor=stranger;
  expect((await dashboard(new Request('http://localhost/api/dashboard?batchId='+added.meta.batchId))).status).toBe(404);
  expect((await patch(req({status:'resolved'}),ctx)).status).toBe(404);
  expect((await action(req({description:'unauthorized'}),ctx)).status).toBe(404);
});
it('anonymous RPC access is denied; tables remain directly unwritable',async()=>{
  await db.exec('set role anon');
  try { await expect(db.exec("select public.read_feedback_batch(null)")).rejects.toThrow(/permission denied/); }
  finally { await db.exec('reset role'); }
  await db.exec('set role authenticated');
  try { await expect(db.exec("update public.issues set status='resolved'")).rejects.toThrow(/permission denied/); }
  finally { await db.exec('reset role'); }
});
it('failed import transaction leaves no partial batch/workspace rows',async()=>{
  const before=(await db.query<{count:number}>('select count(*)::int as count from public.import_batches')).rows[0].count;
  const result=await client.rpc('import_feedback_batch',{p_payload:{batchId:crypto.randomUUID(),source:'upload',filename:'bad.csv',contentHash:'f'.repeat(64),
    records:[{batchId:'wrong'}],patterns:[{}],issues:[],rejectedRows:[]}});
  expect(result.error).not.toBeNull();
  expect((await db.query<{count:number}>('select count(*)::int as count from public.import_batches')).rows[0].count).toBe(before);
});
it('auth rejection happens before malformed body reads; CSRF and invalid schemas are rejected when configured',async()=>{
  auth.requireSession.mockRejectedValueOnce(new HttpError(401,'UNAUTHENTICATED','Sign in'));
  expect((await manual(req({ownerId:'spoof'}))).status).toBe(401);
  const cross=req({review:'text',category:'Product Feedback'});
  cross.headers.set('origin','https://evil.example');
  expect((await manual(cross)).status).toBe(403);
  expect((await manual(req({review:'text',category:'Product Feedback',ownerId:'spoof'}))).status).toBe(400);
  expect((await upload(csvReq('review,category\n"bad,Product Feedback'))).status).toBe(400);
  expect((await patch(req({status:'resolved'}),{params:Promise.resolve({id:'suspected_fraud'})})).status).toBe(403);
});
