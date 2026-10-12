import { expect, it } from 'vitest';
import { boundedBody } from '@/lib/db/body';
it('rejects chunked request bytes exceeding limit even without Content-Length',async()=>{
  const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(6));controller.enqueue(new Uint8Array(6));controller.close();}});
  const request=new Request('http://localhost',{method:'POST',body:stream,duplex:'half'} as RequestInit);
  await expect(boundedBody(request,10)).rejects.toMatchObject({status:413});
});
it('rejects declared oversize before decoding and preserves bounded bytes',async()=>{
  await expect(boundedBody(new Request('http://localhost',{method:'POST',headers:{'content-length':'999'},body:'a'}),10)).rejects.toMatchObject({status:413});
  expect(new TextDecoder().decode(await boundedBody(new Request('http://localhost',{method:'POST',body:'safe'}),10))).toBe('safe');
});
