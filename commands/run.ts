import { Command } from '@cliffy/command';
import { runAction } from './requests/executor.ts';
import type { RunCommandOptions } from './requests/executor.ts';

export const runCommand = new Command()
  .description('Run one or all GraphQL requests from a .http file')
  .arguments('<file:string>')
  .option('-e, --endpoint <endpoint:string>', 'GraphQL endpoint URL')
  .option('-v, --variables <variables:string>', 'JSON string of variables')
  .option('--env-file <file:string>', 'Path to a config.json file with environments')
  .option(
    '--env <name:string>',
    'Environment name from config to use for variable substitution',
  )
  .option(
    '--allow-commands',
    'Allow {{$(...)}} command substitution from query files and env vars',
  )
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
  .option('--fail-on-errors', 'Exit with code 1 if the GraphQL response contains an errors[] array')
  .option('--log-level <level:string>', 'Log level (none, info, debug)', { default: 'info' })
  .action(async (options, file) => {
    try {
      const normalizedLogLevel =
        options.logLevel === 'none' || options.logLevel === 'info' || options.logLevel === 'debug'
          ? options.logLevel
          : 'info';

      const runOptions: RunCommandOptions = {
        endpoint: options.endpoint,
        variables: options.variables,
        envFile: options.envFile,
        env: options.env,
        allowCommands: Boolean(options.allowCommands),
        output: options.output,
        list: Boolean(options.list),
        request: options.request,
        field: options.field,
        failOnErrors: Boolean(options.failOnErrors),
        logLevel: normalizedLogLevel,
      };

      await runAction(runOptions, file);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`❌ ${msg}`);
      Deno.exit(1);
    }
  });
