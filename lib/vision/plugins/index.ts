import type { VisionRequest, VisionResult, VisionPlugin } from "./types";
import { normalizePlugin } from "./base";

const plugins: VisionPlugin[] = [normalizePlugin];

export async function runPre(req: VisionRequest): Promise<VisionRequest> {
  const ordered = [...plugins].sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
  let current = req;
  for (const p of ordered) {
    if (p.preprocess) current = await p.preprocess(current);
  }
  return current;
}

export async function runPost(result: VisionResult, req: VisionRequest): Promise<VisionResult> {
  const ordered = [...plugins].sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
  let current = result;
  for (const p of ordered) {
    if (p.postprocess) current = await p.postprocess(current, req);
  }
  return current;
}
