import { assertEquals, assertExists } from '@std/assert';
import { loadGqlFile } from './gql-parser.ts';

/** Write a temp .http file, parse it, then clean up. */
async function parseHttp(content: string, allowCommandSubstitution = false) {
  const tmpFile = await Deno.makeTempFile({ suffix: '.http' });
  await Deno.writeTextFile(tmpFile, content);
  try {
    return await loadGqlFile(tmpFile, { allowCommandSubstitution });
  } finally {
    await Deno.remove(tmpFile);
  }
}

Deno.test('GqlParser - URL variable is not truncated at inner colons', async () => {
  const content = `@HOST_URL: "https://api.example.com/graphql"

###
POST {{HOST_URL}} HTTP/1.1
Content-Type: application/json

query Ping {
  ping
}
`;
  const parsed = await parseHttp(content);
  assertEquals(parsed.variables['HOST_URL'], 'https://api.example.com/graphql');
});

Deno.test('GqlParser - surrounding double-quotes are stripped from variable values', async () => {
  const content = `@MY_URL: "https://api.example.com"
@MY_PLAIN: plain-value

###
POST https://example.com HTTP/1.1

query Q {
  ping
}
`;
  const parsed = await parseHttp(content);
  assertEquals(parsed.variables['MY_URL'], 'https://api.example.com');
  assertEquals(parsed.variables['MY_PLAIN'], 'plain-value');
});

Deno.test('GqlParser - {{HOST_URL}} in POST line is substituted as endpoint', async () => {
  const content = `@HOST_URL: "https://api.example.com/graphql"

###
POST {{HOST_URL}} HTTP/1.1

query Q {
  ping
}
`;
  const parsed = await parseHttp(content);
  assertEquals(parsed.endpoint, 'https://api.example.com/graphql');
});

Deno.test('GqlParser - unquoted URL variable preserves full URL with colons', async () => {
  const content = `@HOST: https://api.example.com

###
POST {{HOST}} HTTP/1.1

query Q {
  ping
}
`;
  const parsed = await parseHttp(content);
  assertEquals(parsed.variables['HOST'], 'https://api.example.com');
  assertEquals(parsed.endpoint, 'https://api.example.com');
});

Deno.test('GqlParser - command substitution in @TOKEN variable executes and resolves in header', async () => {
  const content = `@TOKEN:{{$(echo test-token)}}

###
POST https://api.example.com/graphql HTTP/1.1
Authorization: Bearer {{TOKEN}}
Content-Type: application/json

query Q {
  ping
}
`;
  const parsed = await parseHttp(content, true);
  assertExists(parsed.requests[0]);
  assertEquals(parsed.requests[0].headers?.['Authorization'], 'Bearer test-token');
});

Deno.test('GqlParser - headers with Bearer token and URL variable both resolve correctly', async () => {
  const content = `@HOST_URL: "https://gateway.example.com/api"
@TOKEN:{{$(echo my-access-token)}}

###
### Request comment line is ignored
POST {{HOST_URL}} HTTP/1.1
Authorization: Bearer {{TOKEN}}
Content-Type: application/json
Accept: application/json

query EndpointPing {
  health {
    ping {
      details
    }
  }
}
`;
  const parsed = await parseHttp(content, true);

  // Variables
  assertEquals(parsed.variables['HOST_URL'], 'https://gateway.example.com/api');

  // Endpoint resolved from variable
  assertEquals(parsed.endpoint, 'https://gateway.example.com/api');

  // Request present and headers resolved
  assertExists(parsed.requests[0]);
  assertEquals(parsed.requests[0].headers?.['Authorization'], 'Bearer my-access-token');
  assertEquals(parsed.requests[0].headers?.['Content-Type'], 'application/json');
  assertEquals(parsed.requests[0].type, 'query');
  assertEquals(parsed.requests[0].name, 'EndpointPing');
});

Deno.test('GqlParser - command substitution remains literal when not explicitly enabled', async () => {
  const content = `@TOKEN:{{$(echo test-token)}}

###
POST https://api.example.com/graphql HTTP/1.1
Authorization: Bearer {{TOKEN}}
Content-Type: application/json

query Q {
  ping
}
`;
  const parsed = await parseHttp(content, false);
  assertExists(parsed.requests[0]);
  assertEquals(parsed.requests[0].headers?.['Authorization'], 'Bearer {{$(echo test-token)}}');
});
