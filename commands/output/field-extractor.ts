import { Logger } from '../../utils/logger.ts';

/** Dot-traverse a JSON value via a dot-separated path (e.g. "data.user.name"). */
export function extractField(value: unknown, path: string, logger: Logger): unknown {
  for (const part of path.split('.')) {
    if (value !== null && typeof value === 'object' && part in (value as Record<string, unknown>)) {
      value = (value as Record<string, unknown>)[part];
    } else {
      logger.error(`Field path "${path}" not found in response (failed at "${part}")`);
      Deno.exit(1);
    }
  }
  return value;
}
