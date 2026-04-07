#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env --allow-net

import { Command } from '@cliffy/command';
import denoJson from './deno.json' with { type: 'json' };
import { runCommand } from './commands/run.ts';
import { configCommand } from './commands/config.ts';
import { validateCommand } from './commands/validate.ts';

const mainCommand = new Command()
  .name('gql-client')
  .version(denoJson.version)
  .description('GraphQL Client CLI for executing queries and mutations')
  .meta('deno', Deno.version.deno)
  .command('run', runCommand)
  .command('config', configCommand)
  .command('validate', validateCommand);

export { mainCommand };

if (import.meta.main) {
  await mainCommand.parse(Deno.args);
}
