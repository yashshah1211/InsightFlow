import { expect, it, vi, beforeEach, afterEach } from 'vitest';
const mocks=vi.hoisted(()=>({getUser:vi.fn(),createServerClient:vi.fn(),set:vi.fn()}));
vi.mock('@supabase/ssr',()=>({createServerClient:mocks.createServerClient}));
vi.mock('next/headers',()=>({cookies:async()=>({getAll:()=>[{name:'sb-session',value:'untrusted-cookie'}],set:mocks.set})}));
import { requireSession } from '@/lib/db/auth';
beforeEach(()=>{
  vi.stubEnv('SUPABASE_URL','https://project.example');
  vi.stubEnv('SUPABASE_ANON_KEY','public-test-key');
  vi.stubEnv('INSIGHTFLOW_WRITES_ENABLED','true');
  mocks.createServerClient.mockReset();
  mocks.getUser.mockReset();
  mocks.createServerClient.mockReturnValue({auth:{getUser:mocks.getUser}});
});
afterEach(()=>vi.unstubAllEnvs());
it('never trusts raw cookie/session; verifies identity via getUser and propagates refreshed cookies',async()=>{
  mocks.getUser.mockResolvedValue({data:{user:{id:'11111111-1111-4111-8111-111111111111'}},error:null});
  expect((await requireSession(true)).userId).toBe('11111111-1111-4111-8111-111111111111');
  expect(mocks.getUser).toHaveBeenCalledOnce();
  const options=mocks.createServerClient.mock.calls[0][2];
  options.cookies.setAll([{name:'refreshed',value:'test',options:{httpOnly:true}}]);
  expect(mocks.set).toHaveBeenCalledWith('refreshed','test',{httpOnly:true});
});
it('forged or expired cookies and disabled/unconfigured writes are rejected',async()=>{
  mocks.getUser.mockResolvedValue({data:{user:null},error:{message:'invalid'}});
  await expect(requireSession(true)).rejects.toMatchObject({status:401});
  vi.stubEnv('INSIGHTFLOW_WRITES_ENABLED','false');
  mocks.createServerClient.mockClear();
  await expect(requireSession(true)).rejects.toMatchObject({status:401});
  expect(mocks.createServerClient).not.toHaveBeenCalled();
  vi.stubEnv('SUPABASE_URL','');
  await expect(requireSession()).rejects.toMatchObject({status:401});
});
