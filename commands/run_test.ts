import { assertEquals, assertExists } from '@std/assert';
import { loadGqlFile } from '../utils/gql-parser.ts';
import { executeCommandTokens } from './tokens/substitution.ts';
import { resolveEnvVariables } from './environment/resolver.ts';
import { runCommand } from './run.ts';

async function expectExit(code: number, fn: () => Promise<void>): Promise<void> {
  const originalExit = Deno.exit;
  (Deno as unknown as { exit: (code?: number) => never }).exit = (exitCode?: number): never => {
    throw new Error(`EXIT:${exitCode ?? 0}`);
  };

  try {
    try {
      await fn();
    } catch (error) {
      assertEquals(String(error).includes(`EXIT:${code}`), true);
    }
  } finally {
    (Deno as unknown as { exit: (code?: number) => never }).exit = originalExit;
  }
}

Deno.test('run command tokens resolve inline command substitution', () => {
  const resolved = executeCommandTokens('Bearer {{$(printf "inline-token")}}');
  assertEquals(resolved, 'Bearer inline-token');
});

Deno.test('resolveEnvVariables resolves selected env from config file', async () => {
  const envFile = await Deno.makeTempFile({ suffix: '.json' });
  try {
    await Deno.writeTextFile(
      envFile,
      JSON.stringify({
        defaultEnv: 'dev',
        environments: {
          dev: { HOST_URL: 'https://dev.example.com/graphql', TOKEN: '{{$(printf "dev-token")}}' },
          prod: {
            HOST_URL: 'https://prod.example.com/graphql',
            TOKEN: '{{$(printf "prod-token")}}',
          },
        },
      }),
    );

    const resolved = await resolveEnvVariables('prod', envFile);
    assertEquals(resolved.envName, 'prod');
    assertEquals(resolved.variables['TOKEN'], '{{$(printf "prod-token")}}');
    assertEquals(resolved.variables['HOST_URL'], 'https://prod.example.com/graphql');
  } finally {
    await Deno.remove(envFile);
  }
});

Deno.test('resolveEnvVariables uses default env from config when --env is omitted', async () => {
  const envFile = await Deno.makeTempFile({ suffix: '.json' });
  try {
    await Deno.writeTextFile(
      envFile,
      JSON.stringify({
        defaultEnv: 'dev',
        environments: {
          dev: { HOST_URL: 'https://dev.example.com/graphql' },
        },
      }),
    );

    const resolved = await resolveEnvVariables(undefined, envFile);
    assertEquals(resolved.envName, 'dev');
    assertEquals(resolved.variables['HOST_URL'], 'https://dev.example.com/graphql');
  } finally {
    await Deno.remove(envFile);
  }
});

Deno.test('resolveEnvVariables asks user to choose env when config has envs but no default', async () => {
  const envFile = await Deno.makeTempFile({ suffix: '.json' });
  try {
    await Deno.writeTextFile(
      envFile,
      JSON.stringify({
        environments: {
          dev: { HOST_URL: 'https://dev.example.com/graphql' },
          prod: { HOST_URL: 'https://prod.example.com/graphql' },
        },
      }),
    );

    let errMsg = '';
    try {
      await resolveEnvVariables(undefined, envFile);
    } catch (error) {
      errMsg = error instanceof Error ? error.message : String(error);
    }

    assertEquals(errMsg.includes('No environment selected'), true);
    assertEquals(errMsg.includes('--env <env name>'), true);
    assertEquals(errMsg.includes('config set-default'), true);
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

Deno.test('run command executes action with normalized options', async () => {
  const httpFile = await Deno.makeTempFile({ suffix: '.http' });
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  let stdout = '';

  try {
    await Deno.writeTextFile(
      httpFile,
      `###
POST https://example.com/graphql HTTP/1.1
Content-Type: application/json

query Ping { ping }
`,
    );

    globalThis.fetch = () => {
      return Promise.resolve(
        new Response(JSON.stringify({ data: { ping: 'pong' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    };

    console.log = (msg?: unknown) => {
      stdout += String(msg ?? '');
    };

    await runCommand.parse([httpFile, '-o', 'compact', '--log-level', 'debug']);
    assertEquals(stdout.includes('"ping":"pong"'), true);
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
    await Deno.remove(httpFile);
  }
});

Deno.test('run command token substitution keeps token when command exits non-zero', () => {
  const unresolved = executeCommandTokens('Bearer {{$(false)}}');
  assertEquals(unresolved, 'Bearer {{$(false)}}');
});

Deno.test('run command catches failures and exits with code 1', async () => {
  const originalError = console.error;
  let stderr = '';
  console.error = (msg?: unknown) => {
    stderr += String(msg ?? '');
  };

  try {
    await expectExit(1, async () => {
      await runCommand.parse(['/definitely/missing.http', '--log-level', 'weird-level']);
    });
    assertEquals(stderr.includes('❌'), true);
  } finally {
    console.error = originalError;
  }
});
