#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env --allow-net

import { Command } from '@cliffy/command';
import denoJson from './deno.json' with { type: 'json' };
import { executeCommand } from './commands/execute.ts';
import { listCommand } from './commands/list.ts';
import { configCommand } from './commands/config.ts';
import { authCommand } from './commands/auth.ts';

const mainCommand = new Command()
  .name('gql-client')
  .version(denoJson.version)
  .description('GraphQL Client CLI for executing queries and mutations')
  .command('execute', executeCommand)
  .command('list', listCommand)
  .command('config', configCommand)
  .command('auth', authCommand);

export { mainCommand };

if (import.meta.main) {
  await mainCommand.parse(Deno.args);
}
