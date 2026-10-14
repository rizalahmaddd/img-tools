import { readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

// onnxruntime-web is loaded from jsDelivr at runtime; its bundled copy exceeds Cloudflare's 25 MiB asset limit.
const LIMIT = 25 * 1024 * 1024;
const dir = 'dist/assets';
let failed = false;
for (const f of readdirSync(dir)) {
  const p = join(dir, f);
  if (f.startsWith('ort-wasm')) {
    unlinkSync(p);
    continue;
  }
  if (statSync(p).size > LIMIT) {
    console.error(`File too large for Cloudflare assets: ${p}`);
    failed = true;
  }
}
if (failed) process.exit(1);
