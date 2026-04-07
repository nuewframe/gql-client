import { assertEquals, assertExists } from '@std/assert';
import { loadGqlFile } from '../utils/gql-parser.ts';
import { executeCommandTokens, loadEnvFile } from './execute.ts';

Deno.test('executeCommandTokens resolves inline command substitution', () => {
  const resolved = executeCommandTokens('Bearer {{$(printf "inline-token")}}');
  assertEquals(resolved, 'Bearer inline-token');
});

Deno.test('loadEnvFile resolves command substitution from env file when enabled', async () => {
  const envFile = await Deno.makeTempFile({ suffix: '.env' });
  try {
    await Deno.writeTextFile(
      envFile,
      'TOKEN={{$(printf "env-token")}}\nHOST_URL=https://example.com/graphql\n',
    );

    const variables = await loadEnvFile(envFile, true);
    assertEquals(variables['TOKEN'], 'env-token');
    assertEquals(variables['HOST_URL'], 'https://example.com/graphql');
  } finally {
    await Deno.remove(envFile);
  }
});

Deno.test('loadEnvFile preserves command substitution from env file when disabled', async () => {
  const envFile = await Deno.makeTempFile({ suffix: '.env' });
  try {
    await Deno.writeTextFile(envFile, 'TOKEN={{$(printf "env-token")}}\n');

    const variables = await loadEnvFile(envFile, false);
    assertEquals(variables['TOKEN'], '{{$(printf "env-token")}}');
  } finally {
    await Deno.remove(envFile);
  }
});

Deno.test('inline TOKEN command substitution flows into Authorization header', async () => {
  const httpFile = await Deno.makeTempFile({ suffix: '.http' });
  try {
    await Deno.writeTextFile(
      httpFile,
      `@TOKEN:{{$(printf "Test")}}
@HOST_URL: https://countries.trevorblades.com/

### Countries data
POST {{HOST_URL}} HTTP/1.1
Content-Type: application/json
Accept: application/json
Authorization: {{TOKEN}}

query { countries { code name } }
`,
    );

    const parsed = await loadGqlFile(httpFile);
    assertExists(parsed.requests[0]);
    assertEquals(parsed.requests[0].headers?.['Authorization'], '{{$(printf "Test")}}');

    const resolvedAuthorization = executeCommandTokens(
      parsed.requests[0].headers?.['Authorization'] ?? '',
    );
    assertEquals(resolvedAuthorization, 'Test');
  } finally {
    await Deno.remove(httpFile);
  }
});
