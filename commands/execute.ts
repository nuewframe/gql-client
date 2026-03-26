import { Command } from '@cliffy/command';
import { GraphQLClient } from 'graphql-request';
import { basename, dirname, fromFileUrl, isAbsolute, resolve } from '@std/path';
import { stringify as yamlStringify } from '@std/yaml';
import { loadCredentials } from './auth.ts';
import { loadGqlFile } from '../utils/gql-parser.ts';
import type { ParsedGqlFile } from '../utils/gql-parser.ts';
import { getConfig } from '../config/config.ts';
import { Logger } from '../utils/logger.ts';

function normalizeAccessToken(token?: string): string | undefined {
  if (!token) {
    return token;
  }

  const trimmed = token.trim();
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(trimmed);
  return bearerMatch ? bearerMatch[1].trim() : trimmed;
}

function resolveAuthPlaceholders(value: string, accessToken?: string, idToken?: string): string {
  const normalizedAccessToken = normalizeAccessToken(accessToken);

  return value
    .replace(/\{\{TOKEN\}\}/g, normalizedAccessToken || '{{TOKEN}}')
    .replace(/\{\{ACCESS_TOKEN\}\}/g, normalizedAccessToken || '{{ACCESS_TOKEN}}')
    .replace(/\{\{ID_TOKEN\}\}/g, idToken || '{{ID_TOKEN}}');
}

/**
 * Resolve file arguments robustly for both absolute and relative paths.
 *
 * Relative path handling strategy:
 * 1) current process CWD (standard usage from any working directory)
 * 2) repo root relative to this file (src: commands/ → ../ = repo root)
 */
async function resolveFilePath(file: string): Promise<string> {
  const candidates = isAbsolute(file) ? [file] : [
    resolve(Deno.cwd(), file),
    resolve(dirname(fromFileUrl(import.meta.url)), '..', file),
  ];

  for (const candidate of candidates) {
    try {
      const stat = await Deno.stat(candidate);
      if (stat.isFile) {
        return candidate;
      }
    } catch {
      // Try the next candidate.
    }
  }

  throw new Error(
    `File not found: ${file}. Checked: ${candidates.join(', ')}`,
  );
}

function listRequests(
  requests: ParsedGqlFile['requests'],
  format: 'yaml' | 'json' | 'pretty' | 'compact' | 'table',
): void {
  const items = requests.map((r, i) => ({
    index: i + 1,
    type: r.type,
    name: r.name ?? '(unnamed)',
  }));

  if (format === 'table') {
    const numWidth = String(requests.length).length;
    const header = `  ${'#'.padStart(numWidth)}  ${'Type'.padEnd(8)}  Name`;
    console.error(header);
    console.error('  ' + '-'.repeat(header.length - 2));
    for (const { index, type, name } of items) {
      console.error(`  ${String(index).padStart(numWidth)}  ${type.padEnd(8)}  ${name}`);
    }
    return;
  }

  if (format === 'yaml') {
    console.log(yamlStringify(items as unknown as Record<string, unknown>[]));
    return;
  }

  // json / pretty / compact
  console.log(format === 'compact' ? JSON.stringify(items) : JSON.stringify(items, null, 2));
}

/** Dot-traverse a JSON value via a dot-separated path (e.g. "data.user.name"). */
function extractField(value: unknown, path: string, logger: Logger): unknown {
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

/** Return true if jq is found on PATH. */
async function isJqAvailable(): Promise<boolean> {
  try {
    const result = await new Deno.Command('jq', {
      args: ['--version'],
      stdout: 'null',
      stderr: 'null',
    }).output();
    return result.success;
  } catch {
    return false;
  }
}

/** Pipe a JSON string through jq with the given expression and return the result. */
async function runJq(expr: string, json: string): Promise<string> {
  const child = new Deno.Command('jq', {
    args: [expr],
    stdin: 'piped',
    stdout: 'piped',
    stderr: 'inherit',
  }).spawn();
  const writer = child.stdin.getWriter();
  await writer.write(new TextEncoder().encode(json));
  await writer.close();
  const result = await child.output();
  if (!result.success) throw new Error(`jq exited with code ${result.code}`);
  // jq adds a trailing newline; trim so writeOutput controls the final newline.
  return new TextDecoder().decode(result.stdout).trimEnd();
}

/** Print `content` to stdout. */
function writeOutput(content: string): void {
  console.log(content);
}

/** Serialize `output`, optionally pipe through jq/--select, then write to stdout. */
async function emitOutput(
  output: unknown,
  format: 'pretty' | 'compact' | 'yaml',
  selectExpr: string | undefined,
  logger: Logger,
): Promise<void> {
  if (format === 'yaml') {
    // YAML does not go through jq (jq operates on JSON); --select is ignored.
    if (selectExpr) {
      logger.warn('--select is not supported with -o yaml. Ignoring.');
    }
    writeOutput(yamlStringify(output as Record<string, unknown>));
    return;
  }

  const serialized = format === 'compact'
    ? JSON.stringify(output)
    : JSON.stringify(output, null, 2);

  if (selectExpr) {
    if (await isJqAvailable()) {
      writeOutput(await runJq(selectExpr, serialized));
    } else {
      logger.warn('jq not found on PATH. Falling back to built-in dot-path extraction.');
      const simplePath = selectExpr.replace(/^\./, '');
      if (/[|[(]/.test(simplePath)) {
        logger.error('Install jq (https://jqlang.org) to use complex expressions.');
        Deno.exit(1);
      }
      const fb = extractField(output, simplePath, logger);
      writeOutput(format === 'compact' ? JSON.stringify(fb) : JSON.stringify(fb, null, 2));
    }
  } else {
    writeOutput(serialized);
  }
}

/** Normalize user-facing format names down to the three emitOutput understands. */
function toEmitFormat(fmt: string): 'pretty' | 'compact' | 'yaml' {
  if (fmt === 'json') return 'pretty'; // json = indented, alias for pretty
  if (fmt === 'table') return 'pretty'; // table is list-only; fall back to pretty for data
  return fmt as 'pretty' | 'compact' | 'yaml';
}

/**
 * Shape of the error thrown by graphql-request when the server returns errors[].
 * This happens for both HTTP-level failures AND HTTP 200 partial-success responses.
 */
interface GqlClientError {
  response: {
    data: Record<string, unknown> | null;
    errors: Array<{ message: string; path?: string[]; extensions?: Record<string, unknown> }>;
    status: number;
  };
  request: unknown;
}

function isGqlClientError(e: unknown): e is GqlClientError {
  if (e === null || typeof e !== 'object') return false;
  const candidate = e as Record<string, unknown>;
  return (
    typeof candidate.response === 'object' &&
    candidate.response !== null &&
    'errors' in (candidate.response as object)
  );
}

export const executeCommand = new Command()
  .description('Execute a GraphQL query or mutation')
  .arguments('<file:string>')
  .option('-e, --endpoint <endpoint:string>', 'GraphQL endpoint URL')
  .option('-v, --variables <variables:string>', 'JSON string of variables')
  .option('--env <env:string>', 'Environment to use')
  .option('--skip-auth', 'Skip authentication')
  .option('--allow-commands', 'Allow {{$(...)}} command substitution from query files')
  .option(
    '-o, --output <format:string>',
    'Output format: yaml (default), json/pretty (indented JSON), compact (single-line JSON), table (text table)',
    { default: 'yaml' },
  )
  .option('-l, --list', 'List all requests in the .http file with their index numbers')
  .option(
    '-n, --request <number:number>',
    'Execute a specific request by 1-based index (see --list); omit to run all requests',
  )
  .option(
    '-f, --field <path:string>',
    'Dot-separated JSON field path to extract from the response (e.g. data.user)',
  )
  .option(
    '--select <expr:string>',
    'jq expression to filter the response (requires jq on PATH; falls back to built-in for simple dot paths)',
  )
  .option('--fail-on-errors', 'Exit with code 1 if the GraphQL response contains an errors[] array')
  .option('--log-level <level:string>', 'Log level (none, info, debug)', { default: 'info' })
  .action(async (options, file) => {
    const format: 'pretty' | 'compact' | 'yaml' | 'json' | 'table' = options.output as
      | 'pretty'
      | 'compact'
      | 'yaml'
      | 'json'
      | 'table';

    if (!['pretty', 'compact', 'yaml', 'json', 'table'].includes(format)) {
      console.error(
        `❌ Invalid -o/--output value: "${format}". Expected: yaml, json, pretty, compact, table.`,
      );
      Deno.exit(1);
    }

    if (options.field && options.select) {
      console.error('❌ --field and --select cannot be combined.');
      Deno.exit(1);
    }

    const effectiveLogLevel =
      (['compact', 'yaml', 'json', 'table'].includes(format) && !options.list)
        ? 'none'
        : (options.logLevel as 'none' | 'info' | 'debug');
    const logger = new Logger(effectiveLogLevel);

    try {
      const config = getConfig();
      const _env = options.env || config.defaultEnv || 'default';

      const resolvedFile = await resolveFilePath(file);
      const parsedFile: ParsedGqlFile = await loadGqlFile(resolvedFile, {
        allowCommandSubstitution: options.allowCommands,
      });

      if (parsedFile.requests.length === 0) {
        logger.error('No requests found in file');
        Deno.exit(1);
      }

      if (options.list) {
        listRequests(parsedFile.requests, format === 'pretty' ? 'yaml' : format);
        Deno.exit(0);
      }

      // Determine which requests to run.
      // -n <number>: run that one request (1-based). Omit: run all sequentially.
      const indicesToRun: number[] = options.request !== undefined
        ? [options.request - 1]
        : Array.from({ length: parsedFile.requests.length }, (_, i) => i);

      if (options.request !== undefined) {
        const idx = indicesToRun[0];
        if (idx < 0 || idx >= parsedFile.requests.length) {
          logger.error(
            `Request #${options.request} not found. File has ${parsedFile.requests.length} request(s). Use --list to see available requests.`,
          );
          Deno.exit(1);
        }
      }

      // Load credentials once for all requests.
      const credentials = options.skipAuth ? null : await loadCredentials(format === 'compact');
      const normalizedAccessToken = normalizeAccessToken(credentials?.access_token);

      const fileEndpoint = options.endpoint || parsedFile.endpoint;
      const endpointSource = options.endpoint ? 'CLI' : `file: ${basename(resolvedFile)}`;
      if (fileEndpoint) {
        logger.info(`Endpoint (${endpointSource}): ${fileEndpoint}`);
      }

      const isMultiRun = indicesToRun.length > 1;
      const compactResults: Array<{ query: string; data: unknown; errors?: unknown[] }> = [];

      for (let runIdx = 0; runIdx < indicesToRun.length; runIdx++) {
        const requestIndex = indicesToRun[runIdx];
        const request = parsedFile.requests[requestIndex];
        const requestLabel = request.name ? `"${request.name}"` : `#${requestIndex + 1}`;

        if (isMultiRun) {
          logger.info(
            `\n── [${runIdx + 1}/${indicesToRun.length}] ${request.type} ${requestLabel}`,
          );
        }

        if (!options.allowCommands && request.headers) {
          const hasCommandPlaceholder = Object.values(request.headers).some((v) =>
            v.includes('{{$(')
          );
          if (hasCommandPlaceholder) {
            logger.error(
              'Command substitution placeholders detected in headers. Re-run with --allow-commands if you trust this file.',
            );
            Deno.exit(1);
          }
        }

        // Per-request endpoint: request-level → file-level → CLI override.
        const endpoint = options.endpoint || request.endpoint || parsedFile.endpoint;
        if (!endpoint) {
          logger.error(
            `No endpoint for request ${requestLabel}. Use --endpoint or specify in file.`,
          );
          Deno.exit(1);
        }

        try {
          new URL(endpoint as string);
        } catch {
          logger.error(`Invalid endpoint URL: ${endpoint}`);
          Deno.exit(1);
        }

        if (isMultiRun && request.endpoint && request.endpoint !== parsedFile.endpoint) {
          logger.info(`  Endpoint: ${endpoint}`);
        }

        // Fresh allHeaders per request (declared before GraphQLClient so the
        // fetch closure captures the right object by reference).
        const allHeaders: Record<string, string> = {};

        const client = new GraphQLClient(endpoint as string, {
          fetch: (url, fetchOpts) => {
            logger.debug('=== REQUEST DETAILS ===');
            logger.debug(`Method: ${fetchOpts?.method || 'POST'}`);
            logger.debug(`URL: ${url}`);
            logger.debug('Headers:');
            if (Object.keys(allHeaders).length > 0) {
              for (const [k, v] of Object.entries(allHeaders)) {
                const dv = k.toLowerCase() === 'authorization' && v.includes('Bearer ')
                  ? `Bearer ${v.replace('Bearer ', '').split('.')[0]}...`
                  : v;
                logger.debug(`  ${k}: ${dv}`);
              }
            } else {
              logger.debug('  (no custom headers)');
            }
            logger.debug('Body:');
            if (fetchOpts?.body) {
              try {
                logger.debug(JSON.stringify(JSON.parse(String(fetchOpts.body))));
              } catch {
                logger.debug(String(fetchOpts.body));
              }
            } else {
              logger.debug('(no body)');
            }
            logger.debug('=== END REQUEST DETAILS ===');
            return fetch(url, fetchOpts);
          },
        });

        if (request.headers) {
          logger.debug('Setting headers from file:');
          for (const [key, value] of Object.entries(request.headers)) {
            const resolvedValue = resolveAuthPlaceholders(
              value,
              credentials?.access_token,
              credentials?.id_token,
            );
            if (
              !options.skipAuth &&
              (resolvedValue.includes('{{TOKEN}}') || resolvedValue.includes('{{ACCESS_TOKEN}}'))
            ) {
              logger.error(
                'Auth placeholder found but no valid access token available. Run okta-client login to refresh credentials.',
              );
              Deno.exit(1);
            }
            const dv = key.toLowerCase() === 'authorization' && value.includes('Bearer ')
              ? `Bearer ${resolvedValue.replace('Bearer ', '').split('.')[0]}...`
              : resolvedValue;
            logger.debug(`  ${key}: ${dv}`);
            allHeaders[key] = resolvedValue;
            client.setHeader(key, resolvedValue);
          }
        }

        if (!options.skipAuth && !allHeaders['Authorization']) {
          if (normalizedAccessToken) {
            allHeaders['Authorization'] = `Bearer ${normalizedAccessToken}`;
            client.setHeader('Authorization', `Bearer ${normalizedAccessToken}`);
            logger.debug('Using Authorization from okta-client credentials');
          }
        } else if (allHeaders['Authorization']) {
          logger.debug('Using Authorization from file (takes precedence over okta-client)');
        }

        logger.debug('All headers configured:');
        for (const [k, v] of Object.entries(allHeaders)) {
          const dv = k.toLowerCase() === 'authorization' && v.includes('Bearer ')
            ? `Bearer ${v.replace('Bearer ', '').split('.')[0]}...`
            : v;
          logger.debug(`  ${k}: ${dv}`);
        }

        let variables = { ...request.variables };
        if (options.variables) {
          try {
            variables = { ...variables, ...JSON.parse(options.variables) };
          } catch (e) {
            logger.error('Invalid variables JSON:', e instanceof Error ? e.message : String(e));
            Deno.exit(1);
          }
        }

        logger.info(`Executing ${request.type} ${requestLabel}…`);

        // ── Execute + per-request error handling ─────────────────────────────────
        let requestStartMs = 0;
        try {
          requestStartMs = performance.now();
          const response = await client.request(request.query, variables);
          const elapsed = Math.round(performance.now() - requestStartMs);

          let output: unknown = response;
          if (options.field) output = extractField(output, options.field, logger);

          if (format === 'compact' || format === 'yaml' || format === 'json') {
            const queryName = request.name ?? `#${requestIndex + 1}`;
            compactResults.push({ query: queryName, data: output });
          } else {
            logger.success(`Done. (${elapsed}ms)`);
            await emitOutput(output, toEmitFormat(format), options.select, logger);
          }
        } catch (requestError) {
          const elapsed = requestStartMs > 0
            ? Math.round(performance.now() - requestStartMs)
            : null;

          if (isGqlClientError(requestError)) {
            const { response: gqlResponse } = requestError;
            const errors = gqlResponse.errors;

            if (Array.isArray(errors) && errors.length > 0) {
              for (const e of errors) {
                const pathLabel = Array.isArray(e.path) && e.path.length > 0
                  ? ` (path: ${e.path.join('.')})`
                  : '';
                logger.warn(`GraphQL error: ${e.message}${pathLabel}`);
              }
            }

            if (gqlResponse.status === 200) {
              if (options.failOnErrors) {
                logger.error('Aborting due to --fail-on-errors.');
                Deno.exit(1);
              }
              let output: unknown = gqlResponse.data ?? {};
              if (options.field) output = extractField(output, options.field, logger);

              if (format === 'compact' || format === 'yaml' || format === 'json') {
                const queryName = request.name ?? `#${requestIndex + 1}`;
                compactResults.push({
                  query: queryName,
                  data: output,
                  errors: errors as unknown[],
                });
              } else {
                logger.success(`Done with errors.${elapsed !== null ? ` (${elapsed}ms)` : ''}`);
                await emitOutput(output, toEmitFormat(format), options.select, logger);
              }
              continue; // advance to next request
            }

            const summary = Array.isArray(errors) && errors.length > 0
              ? errors.map((e) => e.message).join('; ')
              : 'Server returned an error response';
            logger.error(`Execution failed: ${summary}`);
            Deno.exit(1);
          }

          const msg = requestError instanceof Error
            ? requestError.message.split('\n')[0]
            : String(requestError);
          logger.error('Execution failed:', msg);
          Deno.exit(1);
        }
      } // end for loop

      if (format === 'compact' || format === 'yaml' || format === 'json') {
        await emitOutput(
          compactResults,
          format === 'json' ? 'pretty' : format,
          options.select,
          logger,
        );
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message.split('\n')[0] : String(error);
      logger.error('Failed:', msg);
      Deno.exit(1);
    }
  });
