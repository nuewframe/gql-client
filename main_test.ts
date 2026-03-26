import { assert, assertEquals, assertExists } from '@std/assert';

import { mainCommand } from './main.ts';
import { executeCommand } from './commands/execute.ts';
import { listCommand } from './commands/list.ts';
import { configCommand } from './commands/config.ts';
import { authCommand } from './commands/auth.ts';
import { Logger } from './utils/logger.ts';
import { getConfig, saveConfig } from './config/config.ts';
import { loadGqlFile } from './utils/gql-parser.ts';

Deno.test('GQL CLI - main module file exists', async () => {
  const filePath = new URL('./main.ts', import.meta.url);
  const stat = await Deno.stat(filePath);
  assert(stat.isFile);
  assert(stat.size > 0);
});

Deno.test('GQL CLI - main command metadata is set', () => {
  assertEquals(mainCommand.getName(), 'gql-client');
  assertEquals(mainCommand.getVersion(), '1.0.0');
  assert(mainCommand.getDescription().length > 0);
});

Deno.test('GQL CLI - top-level commands are registered', () => {
  assertExists(mainCommand.getCommand('execute'));
  assertExists(mainCommand.getCommand('list'));
  assertExists(mainCommand.getCommand('config'));
  assertExists(mainCommand.getCommand('auth'));
});

Deno.test('GQL CLI - command exports are defined', () => {
  assertExists(executeCommand);
  assertExists(listCommand);
  assertExists(configCommand);
  assertExists(authCommand);
});

Deno.test('GQL CLI - utility exports are available', () => {
  const logger = new Logger('info');
  assertExists(logger);
  assertEquals(typeof logger.info, 'function');
  assertEquals(typeof logger.error, 'function');
  assertEquals(typeof getConfig, 'function');
  assertEquals(typeof saveConfig, 'function');
});

Deno.test('GQL parser smoke - parses simple query file', async () => {
  const content = `
###
POST https://api.example.com/graphql HTTP/1.1
Content-Type: application/json

query GetUser($id: ID!) {
  user(id: $id) {
    id
    name
  }
}

{
  "id": "123"
}
`;

  const tempFile = await Deno.makeTempFile({ suffix: '.gql' });
  await Deno.writeTextFile(tempFile, content);

  try {
    const result = await loadGqlFile(tempFile);
    assertEquals(result.requests.length, 1);
    const request = result.requests[0];
    assertEquals(request.type, 'query');
    assertEquals(request.name, 'GetUser');
    assertEquals(request.headers?.['Content-Type'], 'application/json');
  } finally {
    await Deno.remove(tempFile);
  }
});
