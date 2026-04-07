import { assertEquals, assertStringIncludes } from '@std/assert';
import { runAction } from './executor.ts';

async function createTempHttp(content: string): Promise<string> {
  const file = await Deno.makeTempFile({ suffix: '.http' });
  await Deno.writeTextFile(file, content);
  return file;
}

Deno.test('executor: runAction with multiple requests in list mode', async () => {
  const file = await createTempHttp(`
###
POST https://example.com/graphql HTTP/1.1

query Ping { ping }

###
POST https://example.com/graphql HTTP/1.1

query Pong { pong }
`);

  const originalExit = Deno.exit;
  let exitCalled = false;

  Deno.exit = (() => {
    exitCalled = true;
    throw new Error('EXIT_CALLED');
  }) as typeof Deno.exit;

  try {
    try {
      await runAction({ list: true, logLevel: 'none' }, file);
    } catch (e) {
      if ((e as Error).message !== 'EXIT_CALLED') throw e;
    }
    assertEquals(exitCalled, true, 'Should exit after listing requests');
  } finally {
    Deno.exit = originalExit;
    await Deno.remove(file);
  }
});

Deno.test('executor: runAction with variables from --variables flag', async () => {
  const file = await createTempHttp(`
###
POST https://example.com/graphql HTTP/1.1

query GetUser($id: ID!) { user(id: $id) { name } }
`);

  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  let stdout = '';
  let capturedVariables: unknown = null;

  globalThis.fetch = (_url: string | URL | Request, opts?: RequestInit) => {
    if (opts?.body) {
      const body = JSON.parse(String(opts.body));
      capturedVariables = body.variables;
    }
    return Promise.resolve(
      new Response(JSON.stringify({ data: { user: { name: 'John' } } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  };
  console.log = (msg?: unknown) => {
    stdout += String(msg ?? '');
  };

  try {
    await runAction(
      { variables: '{"id": "42"}', output: 'compact', logLevel: 'none' },
      file,
    );
    assertEquals(capturedVariables, { id: '42' });
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
    await Deno.remove(file);
  }
});

Deno.test('executor: runAction with endpoint from CLI overrides file endpoint', async () => {
  const file = await createTempHttp(`
@ENDPOINT: "https://old.com/graphql"

###
POST {{ ENDPOINT }} HTTP/1.1

query Test { test }
`);

  const originalFetch = globalThis.fetch;
  let capturedUrl = '';

  globalThis.fetch = (url: string | URL | Request) => {
    capturedUrl = String(url);
    return Promise.resolve(
      new Response(JSON.stringify({ data: { test: 'ok' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  };

  try {
    await runAction(
      { endpoint: 'https://new.com/graphql', output: 'compact', logLevel: 'none' },
      file,
    );
    assertEquals(capturedUrl, 'https://new.com/graphql');
  } finally {
    globalThis.fetch = originalFetch;
    await Deno.remove(file);
  }
});

Deno.test('executor: runAction with field extraction', async () => {
  const file = await createTempHttp(`
###
POST https://example.com/graphql HTTP/1.1

query GetUser { user { profile { name } } }
`);

  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  let stdout = '';

  globalThis.fetch = () => {
    return Promise.resolve(
      new Response(
        JSON.stringify({ data: { user: { profile: { name: 'Alice' } } } }),
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
      { field: 'user.profile.name', output: 'compact', logLevel: 'none' },
      file,
    );
    assertStringIncludes(stdout, '"Alice"');
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
    await Deno.remove(file);
  }
});

Deno.test('executor: runAction exits with no requests in file', async () => {
  const file = await createTempHttp(`
# Just a comment, no requests
@VAR: "value"
`);

  const originalExit = Deno.exit;
  let capturedCode = 0;

  Deno.exit = ((code?: number) => {
    capturedCode = code ?? 0;
    throw new Error('EXIT_CALLED');
  }) as typeof Deno.exit;

  try {
    try {
      await runAction({ logLevel: 'none' }, file);
    } catch (e) {
      if ((e as Error).message !== 'EXIT_CALLED') throw e;
    }
    assertEquals(capturedCode, 1);
  } finally {
    Deno.exit = originalExit;
    await Deno.remove(file);
  }
});

Deno.test('executor: runAction exits on invalid variables JSON', async () => {
  const file = await createTempHttp(`
###
POST https://example.com/graphql HTTP/1.1

query Test { test }
`);

  const originalExit = Deno.exit;
  let capturedCode = 0;

  Deno.exit = ((code?: number) => {
    capturedCode = code ?? 0;
    throw new Error('EXIT_CALLED');
  }) as typeof Deno.exit;

  try {
    try {
      await runAction({ variables: 'not json', logLevel: 'none' }, file);
    } catch (e) {
      if ((e as Error).message !== 'EXIT_CALLED') throw e;
    }
    assertEquals(capturedCode, 1);
  } finally {
    Deno.exit = originalExit;
    await Deno.remove(file);
  }
});

Deno.test('executor: runAction executes specific request by index', async () => {
  const file = await createTempHttp(`
###
POST https://example.com/graphql HTTP/1.1

query First { first }

###
POST https://example.com/graphql HTTP/1.1

query Second { second }
`);

  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  let stdout = '';
  let fetchCount = 0;

  globalThis.fetch = () => {
    fetchCount++;
    return Promise.resolve(
      new Response(JSON.stringify({ data: { result: 'ok' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  };
  console.log = (msg?: unknown) => {
    stdout += String(msg ?? '');
  };

  try {
    await runAction({ request: 2, output: 'compact', logLevel: 'none' }, file);
    assertEquals(fetchCount, 1, 'Should only execute one request');
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
    await Deno.remove(file);
  }
});

Deno.test('executor: runAction with pretty format output', async () => {
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
      new Response(JSON.stringify({ data: { test: 'result' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  };
  console.log = (msg?: unknown) => {
    stdout += String(msg ?? '');
  };

  try {
    await runAction({ output: 'pretty', logLevel: 'none' }, file);
    assertStringIncludes(stdout, 'result');
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
    await Deno.remove(file);
  }
});

Deno.test('executor: runAction with JSON output format', async () => {
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
      new Response(JSON.stringify({ data: { test: 'result' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  };
  console.log = (msg?: unknown) => {
    stdout += String(msg ?? '');
  };

  try {
    await runAction({ output: 'json', logLevel: 'none' }, file);
    assertStringIncludes(stdout, 'result');
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
    await Deno.remove(file);
  }
});

