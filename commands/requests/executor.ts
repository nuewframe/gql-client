import { GraphQLClient } from 'graphql-request';
import { basename } from '@std/path';
import { Logger } from '../../utils/logger.ts';
import type { ParsedGqlFile } from '../../utils/gql-parser.ts';
import { loadGqlFile } from '../../utils/gql-parser.ts';
import { isGqlClientError } from '../errors/gql-client-error.ts';
import { executeCommandTokens } from '../tokens/substitution.ts';
import { resolveEnvVariables } from '../environment/resolver.ts';
import { resolveFilePath } from '../files/resolver.ts';
import { emitValidationDiagnostics } from '../validation/validator.ts';
import { listRequests } from './formatter.ts';
import { extractField } from '../output/field-extractor.ts';
import { emitOutput, toEmitFormat } from '../output/formatter.ts';

export type RunOutputFormat = 'pretty' | 'compact' | 'yaml' | 'json' | 'table';

export interface RunCommandOptions {
  endpoint?: string;
  variables?: string;
  envFile?: string;
  env?: string;
  allowCommands?: boolean;
  output?: string;
  list?: boolean;
  request?: number;
  field?: string;
  failOnErrors?: boolean;
  logLevel?: string;
}

export function parseOutputFormat(value: string | undefined): RunOutputFormat {
  const format = (value ?? 'yaml') as RunOutputFormat;
  if (!['pretty', 'compact', 'yaml', 'json', 'table'].includes(format)) {
    throw new Error(
      `Invalid -o/--output value: "${format}". Expected: yaml, json, pretty, compact, table.`,
    );
  }
  return format;
}

export function createRunLogger(
  format: RunOutputFormat,
  listMode: boolean,
  configured: RunCommandOptions['logLevel'],
): Logger {
  const effectiveLogLevel = (['compact', 'yaml', 'json', 'table'].includes(format) && !listMode)
    ? 'none'
    : (configured === 'none' || configured === 'info' || configured === 'debug'
      ? configured
      : 'info');
  return new Logger(effectiveLogLevel);
}

export async function runAction(options: RunCommandOptions, file: string): Promise<void> {
  const format = parseOutputFormat(options.output);

  const logger = createRunLogger(format, Boolean(options.list), options.logLevel);

  const resolvedEnv = await resolveEnvVariables(options.env, options.envFile);
  const envVars = resolvedEnv.variables;
  if (resolvedEnv.envName) {
    logger.debug(`Using environment: ${resolvedEnv.envName} (${Object.keys(envVars).length} vars)`);
  }

  const resolvedFile = await resolveFilePath(file);
  const parsedFile: ParsedGqlFile = await loadGqlFile(resolvedFile, {
    extraVariables: envVars,
  });

  if (options.allowCommands) {
    for (const request of parsedFile.requests) {
      if (request.endpoint) {
        request.endpoint = executeCommandTokens(request.endpoint);
      }
      if (request.headers) {
        for (const key of Object.keys(request.headers)) {
          request.headers[key] = executeCommandTokens(request.headers[key]);
        }
      }
    }
  }

  if (parsedFile.requests.length === 0) {
    logger.error('No requests found in file');
    await emitValidationDiagnostics(resolvedFile);
    Deno.exit(1);
  }

  if (options.list) {
    listRequests(parsedFile.requests, format === 'pretty' ? 'yaml' : format);
    Deno.exit(0);
  }

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
      logger.info(`\n── [${runIdx + 1}/${indicesToRun.length}] ${request.type} ${requestLabel}`);
    }

    if (!options.allowCommands && request.headers) {
      const hasCommandPlaceholder = Object.values(request.headers).some((v) =>
        /\{\{\s*\$\(/.test(v)
      );
      if (hasCommandPlaceholder) {
        logger.error(
          'Command substitution placeholders detected in headers. Re-run with --allow-commands if you trust this file.',
        );
        Deno.exit(1);
      }
    }

    const endpoint = options.endpoint || request.endpoint || parsedFile.endpoint;
    if (!endpoint) {
      logger.error(`No endpoint for request ${requestLabel}. Use --endpoint or specify in file.`);
      Deno.exit(1);
    }

    try {
      new URL(endpoint as string);
    } catch {
      logger.error(`Invalid endpoint URL: ${endpoint}`);
      if (/\{\{.*\}\}/.test(endpoint as string)) {
        await emitValidationDiagnostics(resolvedFile);
      }
      Deno.exit(1);
    }

    if (isMultiRun && request.endpoint && request.endpoint !== parsedFile.endpoint) {
      logger.info(`  Endpoint: ${endpoint}`);
    }

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
        const dv = key.toLowerCase() === 'authorization' && value.includes('Bearer ')
          ? `Bearer ${value.replace('Bearer ', '').split('.')[0]}...`
          : value;
        logger.debug(`  ${key}: ${dv}`);
        allHeaders[key] = value;
        client.setHeader(key, value);
      }
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
        await emitOutput(output, toEmitFormat(format));
      }
    } catch (requestError) {
      const elapsed = requestStartMs > 0 ? Math.round(performance.now() - requestStartMs) : null;

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
            await emitOutput(output, toEmitFormat(format));
          }
          continue;
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
  }

  if (format === 'compact' || format === 'yaml' || format === 'json') {
    await emitOutput(compactResults, format === 'json' ? 'pretty' : format);
  }
}
