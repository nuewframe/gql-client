import { assertEquals, assertRejects, assertStringIncludes } from '@std/assert';
import { createRunLogger, parseOutputFormat, runAction } from './executor.ts';

async function createTempHttp(content: string): Promise<string> {
  const file = await Deno.makeTempFile({ suffix: '.http' });
  await Deno.writeTextFile(file, content);
  return file;
}

async function expectExit(code: number, fn: () => Promise<void>): Promise<void> {
  const originalExit = Deno.exit;
  (Deno as unknown as { exit: (code?: number) => never }).exit = (exitCode?: number): never => {
    throw new Error(`EXIT:${exitCode ?? 0}`);
  };

  try {
    await assertRejects(fn, Error, `EXIT:${code}`);
  } finally {
    (Deno as unknown as { exit: (code?: number) => never }).exit = originalExit;
  }
}

Deno.test('parseOutputFormat validates and normalizes supported formats', () => {
  assertEquals(parseOutputFormat(undefined), 'yaml');
  assertEquals(parseOutputFormat('compact'), 'compact');
  assertEquals(parseOutputFormat('pretty'), 'pretty');
  assertEquals(parseOutputFormat('json'), 'json');
  assertEquals(parseOutputFormat('table'), 'table');

  try {
    parseOutputFormat('xml');
  } catch (error) {
    assertStringIncludes(String(error), 'Invalid -o/--output value');
  }
});

Deno.test('createRunLogger silences compact mode unless list mode is on', () => {
  const originalError = console.error;
  const messages: string[] = [];
  console.error = (...args: unknown[]) => messages.push(args.map((x) => String(x)).join(' '));

  try {
    const compactLogger = createRunLogger('compact', false, 'debug');
    compactLogger.info('hidden');

    const listLogger = createRunLogger('compact', true, 'debug');
    listLogger.debug('visible');

    assertEquals(messages.some((m) => m.includes('hidden')), false);
    assertEquals(messages.some((m) => m.includes('visible')), true);
  } finally {
    console.error = originalError;
  }
});

Deno.test('runAction emits compact output for successful request', async () => {
  const file = await createTempHttp(`
###
POST https://example.com/graphql HTTP/1.1
Content-Type: application/json

query Ping { ping }
`);

  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  let stdout = '';

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

  try {
    await runAction({ output: 'compact', logLevel: 'none' }, file);
    assertStringIncludes(stdout, '"query":"Ping"');
    assertStringIncludes(stdout, '"ping":"pong"');
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
    await Deno.remove(file);
  }
});

Deno.test('runAction keeps GraphQL errors in compact output when failOnErrors is false', async () => {
  const file = await createTempHttp(`
###
POST https://example.com/graphql HTTP/1.1
Content-Type: application/json

query Ping { ping }
`);

  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  let stdout = '';

  globalThis.fetch = () => {
    return Promise.resolve(
      new Response(
        JSON.stringify({
          data: { ping: 'partial' },
          errors: [{ message: 'boom', path: ['ping'] }],
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );
  };
  console.log = (msg?: unknown) => {
    stdout += String(msg ?? '');
  };

  try {
    await runAction({ output: 'compact', logLevel: 'none', failOnErrors: false }, file);
    assertStringIncludes(stdout, '"errors"');
    assertStringIncludes(stdout, '"boom"');
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
    await Deno.remove(file);
  }
});

Deno.test('runAction exits when requested index is out of range', async () => {
  const file = await createTempHttp(`
###
POST https://example.com/graphql HTTP/1.1
Content-Type: application/json

query Ping { ping }
`);

  try {
    await expectExit(1, async () => {
      await runAction({ output: 'compact', request: 2, logLevel: 'none' }, file);
    });
  } finally {
    await Deno.remove(file);
  }
});

Deno.test('runAction exits when endpoint URL is invalid', async () => {
  const file = await createTempHttp(`
###
POST {{ BAD_URL }} HTTP/1.1
Content-Type: application/json

query Ping { ping }
`);

  try {
    await expectExit(1, async () => {
      await runAction({ output: 'compact', logLevel: 'none' }, file);
    });
  } finally {
    await Deno.remove(file);
  }
});
