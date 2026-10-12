import { z } from 'zod';
import { writeFileSync } from 'node:fs';
import { Annotation } from '../src/lib/contracts';
writeFileSync('scripts/adaption/annotation.schema.json',JSON.stringify(z.toJSONSchema(Annotation),null,2)+'\n');
console.log('Exported canonical annotation JSON Schema; no network calls.');
