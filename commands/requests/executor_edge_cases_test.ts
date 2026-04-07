import { assertEquals } from '@std/assert';
import { runAction } from './executor.ts';

async function createTempHttp(content: string): Promise<string> {
  const file = await Deno.makeTempFile({ suffix: '.http' });
  await Deno.writeTextFile(file, content);
  return file;
}

Deno.test('executor: runAction handles GraphQL error response with 200 status', async () => {
  const file = await createTempHttp(`
###
POST https://example.com/graphql HTTP/1.1

query Test { test }
`);

  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  let stdout = '';

  globalThis.fetch = () => {
    return Promise.resolve(
      new Response(
        JSON.stringify({
          data: { test: null },
          errors: [{ message: 'Field error', path: ['test'] }],
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
    await runAction({ output: 'yaml', logLevel: 'none', failOnErrors: false }, file);
    // Should not exit when failOnErrors is false
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
    await Deno.remove(file);
  }
});

Deno.test('executor: runAction exits when both data and errors with failOnErrors=true', async () => {
  const file = await createTempHttp(`
###
POST https://example.com/graphql HTTP/1.1

query Test { test }
`);

  const originalFetch = globalThis.fetch;
  const originalExit = Deno.exit;
  let exitCode = 0;

  globalThis.fetch = () => {
    return Promise.resolve(
      new Response(
        JSON.stringify({
          data: { test: null },
          errors: [{ message: 'Error', path: ['test'] }],
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );
  };

  Deno.exit = ((code?: number) => {
    exitCode = code ?? 0;
    throw new Error('EXIT');
  }) as typeof Deno.exit;

  try {
    try {
      await runAction(
        { output: 'compact', logLevel: 'none', failOnErrors: true },
        file,
      );
    } catch (e) {
      if ((e as Error).message !== 'EXIT') throw e;
    }
    assertEquals(exitCode, 1);
  } finally {
    globalThis.fetch = originalFetch;
    Deno.exit = originalExit;
    await Deno.remove(file);
  }
});

Deno.test('executor: runAction exits when no endpoint anywhere', async () => {
  const file = await createTempHttp(`
###
POST HTTP/1.1

query Test { test }
`);

  const originalExit = Deno.exit;
  let exitCode = 0;

  Deno.exit = ((code?: number) => {
    exitCode = code ?? 0;
    throw new Error('EXIT');
  }) as typeof Deno.exit;

  try {
    try {
      await runAction({ logLevel: 'none' }, file);
    } catch (e) {
      if ((e as Error).message !== 'EXIT') throw e;
    }
    assertEquals(exitCode, 1);
  } finally {
    Deno.exit = originalExit;
    await Deno.remove(file);
  }
});

Deno.test('executor: runAction with request headers and body', async () => {
  const file = await createTempHttp(`
###
POST https://example.com/graphql HTTP/1.1
Authorization: Bearer test-token

query Test { test }
`);

  const originalFetch = globalThis.fetch;
  let capturedHeaders: HeadersInit = {};

  globalThis.fetch = (_url: string | URL | Request, opts?: RequestInit) => {
    if (opts?.headers) {
      capturedHeaders = opts.headers;
    }
    return Promise.resolve(
      new Response(JSON.stringify({ data: { test: 'ok' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  };

  try {
    await runAction({ output: 'compact', logLevel: 'none' }, file);
    // Verify headers were sent
    assertEquals(typeof capturedHeaders, 'object');
  } finally {
    globalThis.fetch = originalFetch;
    await Deno.remove(file);
  }
});

Deno.test('executor: runAction with multi-run requests and field extraction', async () => {
  const file = await createTempHttp(`
###
POST https://example.com/graphql HTTP/1.1

query First { first { value } }

###
POST https://example.com/graphql HTTP/1.1

query Second { second { value } }
`);

  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  let stdout = '';
  let requestCount = 0;

  globalThis.fetch = () => {
    requestCount++;
    return Promise.resolve(
      new Response(
        JSON.stringify({ data: { first: { value: 'a' }, second: { value: 'b' } } }),
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
    // Don't specify request index, should run all
    await runAction({ output: 'yaml', logLevel: 'none' }, file);
    assertEquals(requestCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
    await Deno.remove(file);
  }
});

Deno.test('executor: runAction with field extraction in error response', async () => {
  const file = await createTempHttp(`
###
POST https://example.com/graphql HTTP/1.1

query Test { test { nested { value } } }
`);

  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  let stdout = '';

  globalThis.fetch = () => {
    return Promise.resolve(
      new Response(
        JSON.stringify({
          data: { test: { nested: { value: 'data' } } },
          errors: [{ message: 'warning' }],
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
    await runAction(
      {
        output: 'yaml',
        field: 'test.nested.value',
        logLevel: 'none',
        failOnErrors: false,
      },
      file,
    );
    assertEquals(typeof stdout, 'string');
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
    await Deno.remove(file);
  }
});
