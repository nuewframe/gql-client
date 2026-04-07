import { isAbsolute, resolve } from '@std/path';

/** Resolve a file argument to an absolute path from the caller's cwd. */
export async function resolveFilePath(file: string): Promise<string> {
  const resolved = isAbsolute(file) ? file : resolve(Deno.cwd(), file);
  try {
    const stat = await Deno.stat(resolved);
    if (stat.isFile) return resolved;
  } catch { /* fall through */ }
  throw new Error(`File not found: ${resolved}`);
}
