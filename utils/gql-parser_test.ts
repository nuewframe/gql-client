import { assertEquals, assertExists } from '@std/assert';
import { loadGqlFile, validateHttpFile } from './gql-parser.ts';

/** Write a temp .http file, parse it, then clean up. */
async function parseHttp(content: string, extraVariables?: Record<string, string>) {
  const tmpFile = await Deno.makeTempFile({ suffix: '.http' });
  await Deno.writeTextFile(tmpFile, content);
  try {
    return await loadGqlFile(tmpFile, { extraVariables });
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

Deno.test('GqlParser - command substitution token is always preserved as literal by parser', async () => {
  // The parser leaves {{ $(...) }} tokens untouched regardless of options.
  // Actual command execution is the execute command\'s responsibility.
  const content = `@TOKEN:{{$(echo test-token)}}

###
POST https://api.example.com/graphql HTTP/1.1
Authorization: Bearer {{TOKEN}}
Content-Type: application/json

query Q {
  ping
}
`;
  const parsed = await parseHttp(content);
  assertExists(parsed.requests[0]);
  // TOKEN was substituted to its raw value, but $(...) is left as literal
  assertEquals(parsed.requests[0].headers?.['Authorization'], 'Bearer {{$(echo test-token)}}');
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
  const parsed = await parseHttp(content);

  // Variables
  assertEquals(parsed.variables['HOST_URL'], 'https://gateway.example.com/api');

  // Endpoint resolved from variable
  assertEquals(parsed.endpoint, 'https://gateway.example.com/api');

  // Request present and headers resolved — but command token is still literal
  assertExists(parsed.requests[0]);
  assertEquals(
    parsed.requests[0].headers?.['Authorization'],
    'Bearer {{$(echo my-access-token)}}',
  );
  assertEquals(parsed.requests[0].headers?.['Content-Type'], 'application/json');
  assertEquals(parsed.requests[0].type, 'query');
  assertEquals(parsed.requests[0].name, 'EndpointPing');
});

Deno.test('GqlParser - command substitution remains literal when not explicitly enabled', async () => {
  // Kept for backwards compat: confirms literal behaviour when there is no allowCommands flag.
  const content = `@TOKEN:{{$(echo test-token)}}

###
POST https://api.example.com/graphql HTTP/1.1
Authorization: Bearer {{TOKEN}}
Content-Type: application/json

query Q {
  ping
}
`;
  const parsed = await parseHttp(content);
  assertExists(parsed.requests[0]);
  assertEquals(parsed.requests[0].headers?.['Authorization'], 'Bearer {{$(echo test-token)}}');
});

Deno.test('GqlParser - inline variables override env file variables', async () => {
  const content = `@HOST_URL: https://inline.example.com/graphql
@TOKEN:inline-token

###
POST {{HOST_URL}} HTTP/1.1
Authorization: Bearer {{TOKEN}}
Content-Type: application/json

query Q {
  ping
}
`;

  const parsed = await parseHttp(content, {
    HOST_URL: 'https://env.example.com/graphql',
    TOKEN: 'env-token',
    UNUSED: 'still-allowed',
  });

  assertEquals(parsed.variables['HOST_URL'], 'https://inline.example.com/graphql');
  assertEquals(parsed.variables['TOKEN'], 'inline-token');
  assertEquals(parsed.variables['UNUSED'], 'still-allowed');
  assertEquals(parsed.endpoint, 'https://inline.example.com/graphql');
  assertEquals(parsed.requests[0].headers?.['Authorization'], 'Bearer inline-token');
});

Deno.test('GqlParser - JSON variables parse from correct position when lines repeat', async () => {
  // Regression test for lines.indexOf(line) bug:
  // if multiple lines share the same content, indexOf returned the first occurrence
  // instead of the actual current position, corrupting variable extraction.
  const content = `###
POST https://api.example.com/graphql HTTP/1.1
Content-Type: application/json

query GetUser($id: ID!) {
  user(id: $id) { id name }
}

{
  "id": "123"
}
`;
  const parsed = await parseHttp(content);
  assertEquals(parsed.requests.length, 1);
  assertEquals(parsed.requests[0].variables, { id: '123' });
});

// ── Separator tolerance tests ──

Deno.test('GqlParser - ### with trailing whitespace is recognised as separator', async () => {
  const content = `@HOST: https://example.com

###   
POST {{HOST}} HTTP/1.1
Content-Type: application/json

query Q { ping }
`;
  const parsed = await parseHttp(content);
  assertEquals(parsed.requests.length, 1);
  assertEquals(parsed.requests[0].name, 'Q');
});

Deno.test('GqlParser - ### with trailing comment is recognised as separator', async () => {
  const content = `@HOST: https://example.com

### My First Request
POST {{HOST}} HTTP/1.1
Content-Type: application/json

query First { ping }

### Second request
POST {{HOST}} HTTP/1.1
Content-Type: application/json

mutation Second { doThing }
`;
  const parsed = await parseHttp(content);
  assertEquals(parsed.requests.length, 2);
  assertEquals(parsed.requests[0].name, 'First');
  assertEquals(parsed.requests[1].name, 'Second');
});

// ── validateHttpFile tests ──

Deno.test('validateHttpFile - reports missing ### separators', () => {
  const content = `@HOST_URL: "https://example.com"

POST {{HOST_URL}} HTTP/1.1
Content-Type: application/json

query Q { ping }
`;
  const issues = validateHttpFile(content);
  assertEquals(
    issues.some((i) => i.severity === 'error' && i.message.includes('No request sep')),
    true,
  );
});

Deno.test('validateHttpFile - no issues for valid file', () => {
  const content = `@HOST_URL: "https://example.com"

###
POST {{HOST_URL}} HTTP/1.1
Content-Type: application/json

query Q { ping }
`;
  const issues = validateHttpFile(content);
  assertEquals(issues.length, 0);
});

Deno.test('validateHttpFile - warns on empty request section', () => {
  const content = `@HOST_URL: "https://example.com"

###
`;
  const issues = validateHttpFile(content);
  assertEquals(issues.some((i) => i.message.includes('empty')), true);
});

Deno.test('validateHttpFile - warns on missing method line', () => {
  const content = `###
Content-Type: application/json

query Q { ping }
`;
  const issues = validateHttpFile(content);
  assertEquals(issues.some((i) => i.message.includes('HTTP method')), true);
});

Deno.test('validateHttpFile - warns on missing query/mutation body', () => {
  const content = `###
POST https://example.com HTTP/1.1
Content-Type: application/json

`;
  const issues = validateHttpFile(content);
  assertEquals(issues.some((i) => i.message.includes('query or mutation')), true);
});

Deno.test('validateHttpFile - warns on undefined variable reference', () => {
  const content = `###
POST {{HOST_URL}} HTTP/1.1
Content-Type: application/json

query Q { ping }
`;
  const issues = validateHttpFile(content);
  assertEquals(
    issues.some((i) => i.message.includes('HOST_URL') && i.message.includes('not defined')),
    true,
  );
});

Deno.test('validateHttpFile - detects near-miss separators (## or ####)', () => {
  const content = `@HOST: https://example.com

##
POST {{HOST}} HTTP/1.1
query Q { ping }
`;
  const issues = validateHttpFile(content);
  assertEquals(issues.some((i) => i.message.includes('looks like a separator')), true);
});

Deno.test('validateHttpFile - detects ### used as comment for @VAR line', () => {
  const content = `### @TOKEN:{{$(echo "Test")}}
@HOST_URL: https://example.com

### Request
POST {{HOST_URL}} HTTP/1.1
Content-Type: application/json

query Q { ping }
`;
  const issues = validateHttpFile(content);
  assertEquals(
    issues.some((i) =>
      i.severity === 'error' && i.message.includes('not a comment') && i.message.includes('#')
    ),
    true,
  );
});
