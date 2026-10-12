import { importWrite } from '@/lib/db/writes';
export async function POST(request?: Request) { return importWrite(request); }
