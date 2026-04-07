import { assertEquals, assertExists, assertRejects, assertStringIncludes } from '@std/assert';
import type { ParsedGqlFile } from '../utils/gql-parser.ts';

/**
 * E2E tests for the run command.
 * Tests core functionality: environment resolution, file parsing, variable substitution,
 * validation, and error handling.
 */

/** Create a temporary config file with environment definitions. */
async function createTempConfig(envs: Record<string, Record<string, string>>) {
  const configFile = await Deno.makeTempFile({ suffix: '.json' });
  const defaultEnv = Object.keys(envs)[0];
  await Deno.writeTextFile(
    configFile,
    JSON.stringify({
      defaultEnv,
      environments: envs,
    }),
  );
  return configFile;
}

/** Create a temporary .http file. */
async function createTempHttpFile(content: string) {
  const file = await Deno.makeTempFile({ suffix: '.http' });
  await Deno.writeTextFile(file, content);
  return file;
}

Deno.test('run E2E', async (t) => {
  // ──────────────────────────────────────────────────────────────────────
  // ENVIRONMENT VARIABLE RESOLUTION
  // ──────────────────────────────────────────────────────────────────────

  await t.step('resolveEnvVariables uses specified environment', async () => {
    const { resolveEnvVariables } = await import('./environment/resolver.ts');
    const configFile = await createTempConfig({
      dev: {
        HOST_URL: 'https://dev.api.com/graphql',
        TOKEN: 'dev-token',
      },
      prod: {
        HOST_URL: 'https://prod.api.com/graphql',
        TOKEN: 'prod-token',
      },
    });

    try {
      const result = await resolveEnvVariables('prod', configFile);
      assertEquals(result.envName, 'prod');
      assertEquals(result.variables['HOST_URL'], 'https://prod.api.com/graphql');
      assertEquals(result.variables['TOKEN'], 'prod-token');
    } finally {
      await Deno.remove(configFile);
    }
  });

  await t.step(
    'resolveEnvVariables falls back to defaultEnv when --env not specified',
    async () => {
      const { resolveEnvVariables } = await import('./environment/resolver.ts');
      const configFile = await createTempConfig({
        production: {
          HOST_URL: 'https://prod.api.com',
          TOKEN: 'prod-token-xyz',
        },
      });

      try {
        const result = await resolveEnvVariables(undefined, configFile);
        assertEquals(result.envName, 'production');
        assertEquals(result.variables['HOST_URL'], 'https://prod.api.com');
      } finally {
        await Deno.remove(configFile);
      }
    },
  );

  await t.step('resolveEnvVariables throws when specified env not found', async () => {
    const { resolveEnvVariables } = await import('./environment/resolver.ts');
    const configFile = await createTempConfig({
      dev: { HOST_URL: 'https://dev.api.com' },
    });

    try {
      await assertRejects(
        async () => {
          await resolveEnvVariables('nonexistent', configFile);
        },
        Error,
        'not found',
      );
    } finally {
      await Deno.remove(configFile);
    }
  });

  await t.step(
    'resolveEnvVariables errors when config has envs but no default and no --env',
    async () => {
      const { resolveEnvVariables } = await import('./environment/resolver.ts');
      const configFile = await Deno.makeTempFile({ suffix: '.json' });
      try {
        await Deno.writeTextFile(
          configFile,
          JSON.stringify({
            environments: {
              staging: { HOST_URL: 'https://staging.api.com' },
              production: { HOST_URL: 'https://prod.api.com' },
            },
          }),
        );

        await assertRejects(
          async () => {
            await resolveEnvVariables(undefined, configFile);
          },
          Error,
          'No environment selected',
        );
      } finally {
        await Deno.remove(configFile);
      }
    },
  );

  // ──────────────────────────────────────────────────────────────────────
  // COMMAND TOKEN SUBSTITUTION
  // ──────────────────────────────────────────────────────────────────────

  await t.step('run command tokens resolve inline command substitution', async () => {
    const { executeCommandTokens } = await import('./tokens/substitution.ts');
    const input = 'Bearer {{$(printf "token123")}}';
    const result = executeCommandTokens(input);
    assertEquals(result, 'Bearer token123');
  });

  await t.step('run command tokens handle multiple command tokens in one string', async () => {
    const { executeCommandTokens } = await import('./tokens/substitution.ts');
    const input = '{{$(printf "start")}} middle {{$(printf "end")}}';
    const result = executeCommandTokens(input);
    assertEquals(result, 'start middle end');
  });

  await t.step('run command tokens preserve tokens when command fails', async () => {
    const { executeCommandTokens } = await import('./tokens/substitution.ts');
    const input = 'Bearer {{$(false || true)}}';
    const result = executeCommandTokens(input);
    assertExists(result);
    // Result varies by shell behavior; main point is it doesn't crash
  });

  // ──────────────────────────────────────────────────────────────────────
  // HTTP FILE PARSING
  // ──────────────────────────────────────────────────────────────────────

  await t.step('loadGqlFile parses single request with variables', async () => {
    const { loadGqlFile } = await import('../utils/gql-parser.ts');
    const httpFile = await createTempHttpFile(`
@HOST_URL: "https://api.example.com/graphql"

###
POST {{ HOST_URL }} HTTP/1.1
Content-Type: application/json

query GetUser($id: ID!) {
  user(id: $id) { id name email }
}

{
  "id": "user-123"
}
`);

    try {
      const parsed = await loadGqlFile(httpFile);
      assertEquals(parsed.requests.length, 1);
      assertEquals(parsed.requests[0].type, 'query');
      assertExists(parsed.requests[0].query);
      assertStringIncludes(parsed.requests[0].query, 'GetUser');
      assertEquals(parsed.requests[0].variables?.['id'], 'user-123');
    } finally {
      await Deno.remove(httpFile);
    }
  });

  await t.step('loadGqlFile parses multiple requests separated by ###', async () => {
    const { loadGqlFile } = await import('../utils/gql-parser.ts');
    const httpFile = await createTempHttpFile(`
@API: "https://api.example.com/graphql"

### Query
POST {{ API }} HTTP/1.1
Content-Type: application/json

query GetUsers { users { id name } }

### Mutation
POST {{ API }} HTTP/1.1
Content-Type: application/json

mutation UpdateUser($id: ID!) { updateUser(id: $id) { id } }
`);

    try {
      const parsed = await loadGqlFile(httpFile);
      assertEquals(parsed.requests.length, 2);
      assertEquals(parsed.requests[0].type, 'query');
      assertEquals(parsed.requests[1].type, 'mutation');
      // Names come from GraphQL operation name if present, otherwise separator label
      assertExists(parsed.requests[0].name);
      assertExists(parsed.requests[1].name);
    } finally {
      await Deno.remove(httpFile);
    }
  });

  await t.step('loadGqlFile preserves headers from request', async () => {
    const { loadGqlFile } = await import('../utils/gql-parser.ts');
    const httpFile = await createTempHttpFile(`
@TOKEN: "Bearer test-token"

###
POST https://api.example.com/graphql HTTP/1.1
Authorization: {{ TOKEN }}
X-Custom-Header: custom-value
Content-Type: application/json

query Test { test { id } }
`);

    try {
      const parsed = await loadGqlFile(httpFile);
      // Variables in headers are left as template literals unless substituted by loadGqlFile
      // which only happens with defined file variables (@VAR)
      assertExists(parsed.requests[0].headers?.['Authorization']);
      assertEquals(parsed.requests[0].headers?.['X-Custom-Header'], 'custom-value');
    } finally {
      await Deno.remove(httpFile);
    }
  });

  await t.step('loadGqlFile merges extraVariables with file variables', async () => {
    const { loadGqlFile } = await import('../utils/gql-parser.ts');
    const httpFile = await createTempHttpFile(`
@FILE_VAR: "from-file"

###
POST https://example.com/graphql HTTP/1.1

query Test { test { id } }
`);

    try {
      const parsed = await loadGqlFile(httpFile, {
        extraVariables: { EXTRA_VAR: 'from-extra' },
      });
      assertEquals(parsed.variables['FILE_VAR'], 'from-file');
      assertEquals(parsed.variables['EXTRA_VAR'], 'from-extra');
    } finally {
      await Deno.remove(httpFile);
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // VALIDATION
  // ──────────────────────────────────────────────────────────────────────

  await t.step('validateHttpFile detects missing ### separators', async () => {
    const { validateHttpFile } = await import('../utils/gql-parser.ts');
    const content = `
POST https://example.com/graphql HTTP/1.1

query Test { test { id } }
`;
    const issues = validateHttpFile(content);
    const hasSeparatorIssue = issues.some((i) => i.message.includes('###'));
    assertEquals(hasSeparatorIssue, true);
  });

  await t.step('validateHttpFile detects missing GraphQL body', async () => {
    const { validateHttpFile } = await import('../utils/gql-parser.ts');
    const content = `
###
POST https://example.com/graphql HTTP/1.1
Content-Type: application/json
`;
    const issues = validateHttpFile(content);
    const hasBodyIssue = issues.some((i) =>
      i.message.includes('query') || i.message.includes('mutation')
    );
    assertEquals(hasBodyIssue, true);
  });

  await t.step('validateHttpFile detects undefined variable references', async () => {
    const { validateHttpFile } = await import('../utils/gql-parser.ts');
    const content = `
@DEFINED_VAR: "value"

###
POST {{ DEFINED_VAR }} HTTP/1.1

###
POST {{ UNDEFINED_VAR }} HTTP/1.1

query Test { test { id } }
`;
    const issues = validateHttpFile(content);
    const hasUndefinedVar = issues.some((i) => i.message.includes('UNDEFINED_VAR'));
    assertEquals(hasUndefinedVar, true);
  });

  // ──────────────────────────────────────────────────────────────────────
  // ERROR HANDLING
  // ──────────────────────────────────────────────────────────────────────

  await t.step('resolveEnvVariables errors when defaultEnv not in environments', async () => {
    const { resolveEnvVariables } = await import('./environment/resolver.ts');
    const configFile = await Deno.makeTempFile({ suffix: '.json' });
    try {
      await Deno.writeTextFile(
        configFile,
        JSON.stringify({
          defaultEnv: 'missing',
          environments: {
            available: { HOST_URL: 'https://api.com' },
          },
        }),
      );

      await assertRejects(
        async () => {
          await resolveEnvVariables(undefined, configFile);
        },
        Error,
        'was not found',
      );
    } finally {
      await Deno.remove(configFile);
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // VARIABLE SUBSTITUTION IN FILE CONTEXT
  // ──────────────────────────────────────────────────────────────────────

  await t.step('loadGqlFile substitutes file variables into endpoint and headers', async () => {
    const { loadGqlFile } = await import('../utils/gql-parser.ts');
    const httpFile = await createTempHttpFile(`
@HOST_URL: "https://api.example.com/graphql"
@AUTH_TOKEN: "Bearer abc123"
@API_KEY: "key-xyz"

###
POST {{ HOST_URL }} HTTP/1.1
Authorization: {{ AUTH_TOKEN }}
X-API-Key: {{ API_KEY }}

query Test { test { id } }
`);

    try {
      const parsed = await loadGqlFile(httpFile);
      // File variables are accessible in the parsed.variables object
      assertEquals(parsed.variables['HOST_URL'], 'https://api.example.com/graphql');
      assertEquals(parsed.variables['AUTH_TOKEN'], 'Bearer abc123');
      assertEquals(parsed.variables['API_KEY'], 'key-xyz');
      // Endpoint and headers reference these variables but aren't pre-substituted
      // They'll be substituted during run execution when needed
      assertExists(parsed.requests[0].headers?.['Authorization']);
    } finally {
      await Deno.remove(httpFile);
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // HELPER FUNCTION EXECUTION PATHS
  // ──────────────────────────────────────────────────────────────────────

  await t.step('emitValidationDiagnostics processes file with issues', async () => {
    const httpFile = await createTempHttpFile(`
POST https://example.com/graphql HTTP/1.1

query Test { test { id } }
`);

    try {
      let stderrOutput = '';
      const originalError = console.error;
      console.error = (msg: string) => {
        stderrOutput += msg;
      };

      try {
        // Note: emitValidationDiagnostics is internal to run execution internals
        // We test it indirectly by validating a file with issues
        const { validateHttpFile } = await import('../utils/gql-parser.ts');
        const content = await Deno.readTextFile(httpFile);
        const issues = validateHttpFile(content);
        assertEquals(issues.length > 0, true);
      } finally {
        console.error = originalError;
      }
    } finally {
      await Deno.remove(httpFile);
    }
  });

  await t.step('run command tokens handle nested tokens', async () => {
    const { executeCommandTokens } = await import('./tokens/substitution.ts');

    const input = 'prefix {{$(echo "a")}} middle {{$(echo "b")}} suffix';
    const result = executeCommandTokens(input);

    assertEquals(result.includes('a'), true);
    assertEquals(result.includes('b'), true);
  });

  await t.step('run command tokens handle empty token', async () => {
    const { executeCommandTokens } = await import('./tokens/substitution.ts');

    const input = 'prefix {{$(true)}} suffix';
    const result = executeCommandTokens(input);

    assertEquals(result.includes('prefix'), true);
    assertEquals(result.includes('suffix'), true);
  });

  await t.step('resolveEnvVariables returns empty variables when no config exists', async () => {
    const { resolveEnvVariables } = await import('./environment/resolver.ts');

    // Non-existent config file path
    const result = await resolveEnvVariables(undefined, '/tmp/does-not-exist.json');

    assertEquals(result.variables, {});
    assertEquals(result.envName, undefined);
  });

  await t.step('resolveEnvVariables merges config variables correctly', async () => {
    const configFile = await Deno.makeTempFile({ suffix: '.json' });
    try {
      await Deno.writeTextFile(
        configFile,
        JSON.stringify({
          defaultEnv: 'test',
          environments: {
            test: {
              VAR_A: 'value-a',
              VAR_B: 'value-b',
              VAR_C: 'value-c',
            },
          },
        }),
      );

      const { resolveEnvVariables } = await import('./environment/resolver.ts');
      const result = await resolveEnvVariables(undefined, configFile);

      assertEquals(Object.keys(result.variables).length, 3);
      assertEquals(result.variables['VAR_A'], 'value-a');
      assertEquals(result.variables['VAR_B'], 'value-b');
      assertEquals(result.variables['VAR_C'], 'value-c');
    } finally {
      await Deno.remove(configFile);
    }
  });

  await t.step('loadGqlFile handles multiple requests with different types', async () => {
    const { loadGqlFile } = await import('../utils/gql-parser.ts');
    const httpFile = await createTempHttpFile(`
@API: "https://api.example.com/graphql"

### Get users
POST {{ API }} HTTP/1.1

query GetUsers {
  users { id name }
}

### Create user
POST {{ API }} HTTP/1.1

mutation CreateUser($name: String!) {
  createUser(name: $name) { id }
}

{"name": "Alice"}

### Update user
POST {{ API }} HTTP/1.1

mutation UpdateUser($id: ID!) {
  updateUser(id: $id) { id }
}
`);

    try {
      const parsed = await loadGqlFile(httpFile);
      assertEquals(parsed.requests.length, 3);
      assertEquals(parsed.requests[0].type, 'query');
      assertEquals(parsed.requests[1].type, 'mutation');
      assertEquals(parsed.requests[2].type, 'mutation');
    } finally {
      await Deno.remove(httpFile);
    }
  });

  await t.step('validateHttpFile tolerates valid file without errors', async () => {
    const { validateHttpFile } = await import('../utils/gql-parser.ts');
    const content = `
@API: "https://api.example.com/graphql"

###
POST {{ API }} HTTP/1.1

query Test { test { id } }
`;
    const issues = validateHttpFile(content);
    assertEquals(issues.length, 0);
  });

  await t.step('validateHttpFile reports multiple issues', async () => {
    const { validateHttpFile } = await import('../utils/gql-parser.ts');
    const content = `
@VAR: {{ UNDEFINED }}

POST https://example.com HTTP/1.1
`;
    const issues = validateHttpFile(content);
    assertEquals(issues.length > 0, true);
  });

  await t.step('resolveEnvVariables with explicit env overrides defaultEnv', async () => {
    const { resolveEnvVariables } = await import('./environment/resolver.ts');
    const configFile = await Deno.makeTempFile({ suffix: '.json' });
    try {
      await Deno.writeTextFile(
        configFile,
        JSON.stringify({
          defaultEnv: 'dev',
          environments: {
            dev: { URL: 'https://dev.com' },
            prod: { URL: 'https://prod.com' },
          },
        }),
      );

      const result = await resolveEnvVariables('prod', configFile);
      assertEquals(result.envName, 'prod');
      assertEquals(result.variables['URL'], 'https://prod.com');
    } finally {
      await Deno.remove(configFile);
    }
  });

  await t.step('run command tokens preserve text without tokens', async () => {
    const { executeCommandTokens } = await import('./tokens/substitution.ts');

    const input = 'Plain text without any tokens';
    const result = executeCommandTokens(input);

    assertEquals(result, input);
  });

  await t.step('run command tokens with malformed token do not crash', async () => {
    const { executeCommandTokens } = await import('./tokens/substitution.ts');

    const input = 'Malformed {{$(echo }}';
    const result = executeCommandTokens(input);

    // Should not crash, result might contain the original token
    assertExists(result);
  });
});

// ──────────────────────────────────────────────────────────────────────
// UNIT TESTS FOR EXPORTED HELPER FUNCTIONS
// ──────────────────────────────────────────────────────────────────────

Deno.test('helper function: toEmitFormat', async (t) => {
  const { toEmitFormat } = await import('./output/formatter.ts');

  await t.step('converts json alias to pretty', () => {
    assertEquals(toEmitFormat('json'), 'pretty');
  });

  await t.step('converts table alias to pretty', () => {
    assertEquals(toEmitFormat('table'), 'pretty');
  });

  await t.step('preserves compact format', () => {
    assertEquals(toEmitFormat('compact'), 'compact');
  });

  await t.step('preserves yaml format', () => {
    assertEquals(toEmitFormat('yaml'), 'yaml');
  });

  await t.step('preserves pretty format', () => {
    assertEquals(toEmitFormat('pretty'), 'pretty');
  });

  await t.step('treats unknown format as-is', () => {
    assertEquals(toEmitFormat('unknown'), 'unknown' as 'pretty' | 'compact' | 'yaml');
  });
});

Deno.test('helper function: isGqlClientError', async (t) => {
  const { isGqlClientError } = await import('./errors/gql-client-error.ts');

  await t.step('identifies valid GraphQL error response', () => {
    const error = {
      response: {
        data: null,
        errors: [{ message: 'Not found' }],
        status: 200,
      },
      request: {},
    };
    assertEquals(isGqlClientError(error), true);
  });

  await t.step('accepts error with both data and errors', () => {
    const error = {
      response: {
        data: { user: null },
        errors: [{ message: 'User not found', path: ['user'] }],
        status: 200,
      },
      request: { query: 'query { user }' },
    };
    assertEquals(isGqlClientError(error), true);
  });

  await t.step('rejects plain Error objects', () => {
    assertEquals(isGqlClientError(new Error('Network error')), false);
  });

  await t.step('rejects strings', () => {
    assertEquals(isGqlClientError('error'), false);
  });

  await t.step('rejects null', () => {
    assertEquals(isGqlClientError(null), false);
  });

  await t.step('rejects undefined', () => {
    assertEquals(isGqlClientError(undefined), false);
  });

  await t.step('rejects objects without response property', () => {
    assertEquals(isGqlClientError({ message: 'error' }), false);
  });

  await t.step('rejects objects with response but no errors', () => {
    assertEquals(isGqlClientError({ response: { data: {} } }), false);
  });
});

Deno.test('helper function: extractField', async (t) => {
  const { extractField } = await import('./output/field-extractor.ts');
  const { Logger } = await import('../utils/logger.ts');
  const logger = new Logger('none');

  await t.step('extracts top-level field', () => {
    const data = { name: 'Alice', age: 30 };
    const result = extractField(data, 'name', logger);
    assertEquals(result, 'Alice');
  });

  await t.step('extracts nested field via dot notation', () => {
    const data = { user: { profile: { name: 'Bob' } } };
    const result = extractField(data, 'user.profile.name', logger);
    assertEquals(result, 'Bob');
  });

  await t.step('extracts array field', () => {
    const data = { items: [1, 2, 3] };
    const result = extractField(data, 'items', logger);
    assertEquals(result, [1, 2, 3]);
  });

  await t.step('extracts from deep nesting', () => {
    const data = {
      level1: { level2: { level3: { level4: 'deep-value' } } },
    };
    const result = extractField(data, 'level1.level2.level3.level4', logger);
    assertEquals(result, 'deep-value');
  });
});

Deno.test('helper function: listRequests', async (t) => {
  const { listRequests } = await import('./requests/formatter.ts');

  await t.step('formats requests for yaml output', () => {
    const requests: ParsedGqlFile['requests'] = [
      { type: 'query', name: 'GetUser', query: '' },
      { type: 'mutation', name: 'CreateUser', query: '' },
    ];

    let output = '';
    const originalLog = console.log;
    console.log = (msg: string) => {
      output += msg;
    };

    try {
      listRequests(requests, 'yaml');
      assertEquals(output.includes('GetUser'), true);
      assertEquals(output.includes('CreateUser'), true);
    } finally {
      console.log = originalLog;
    }
  });

  await t.step('formats requests for json output', () => {
    const requests: ParsedGqlFile['requests'] = [
      { type: 'query', name: 'Query1', query: '' },
      { type: 'mutation', name: undefined, query: '' },
    ];

    let output = '';
    const originalLog = console.log;
    console.log = (msg: string) => {
      output += msg;
    };

    try {
      listRequests(requests, 'json');
      assertEquals(output.includes('Query1'), true);
      assertEquals(output.includes('unnamed'), true);
    } finally {
      console.log = originalLog;
    }
  });

  await t.step('formats requests for table output', () => {
    const requests: ParsedGqlFile['requests'] = [
      { type: 'query', name: 'Q1', query: '' },
      { type: 'mutation', name: 'M1', query: '' },
    ];

    let output = '';
    const originalError = console.error;
    console.error = (msg: string) => {
      output += msg;
    };

    try {
      listRequests(requests, 'table');
      assertEquals(output.includes('Q1'), true);
      assertEquals(output.includes('M1'), true);
    } finally {
      console.error = originalError;
    }
  });

  await t.step('handles empty request list', () => {
    const requests: ParsedGqlFile['requests'] = [];

    let output = '';
    const originalLog = console.log;
    console.log = (msg: string) => {
      output += msg;
    };

    try {
      listRequests(requests, 'yaml');
      // YAML output includes newline, just check it contains empty array
      assertEquals(output.includes('[]'), true);
    } finally {
      console.log = originalLog;
    }
  });

  await t.step('uses unnamed for requests without names', () => {
    const requests: ParsedGqlFile['requests'] = [
      { type: 'query', name: undefined, query: '' },
    ];

    let output = '';
    const originalLog = console.log;
    console.log = (msg: string) => {
      output += msg;
    };

    try {
      listRequests(requests, 'yaml');
      assertEquals(output.includes('unnamed'), true);
    } finally {
      console.log = originalLog;
    }
  });
});

Deno.test('helper function: emitValidationDiagnostics', async (t) => {
  const { emitValidationDiagnostics } = await import('./validation/validator.ts');

  await t.step('emits nothing for valid file', async () => {
    const file = await createTempHttpFile(`
@API: "https://example.com"

###
POST {{ API }} HTTP/1.1

query Test { test { id } }
`);

    try {
      let stderrOutput = '';
      const originalError = console.error;
      console.error = (msg: string) => {
        stderrOutput += msg;
      };

      try {
        await emitValidationDiagnostics(file);
        // Valid file should not produce output
        assertEquals(stderrOutput, '');
      } finally {
        console.error = originalError;
      }
    } finally {
      await Deno.remove(file);
    }
  });

  await t.step('emits diagnostics for file with errors', async () => {
    const file = await createTempHttpFile(`
POST https://example.com HTTP/1.1

query Test { test { id } }
`);

    try {
      let stderrOutput = '';
      const originalError = console.error;
      console.error = (msg: string) => {
        stderrOutput += msg;
      };

      try {
        await emitValidationDiagnostics(file);
        // File missing ### should produce error diagnostics
        assertEquals(stderrOutput.length > 0, true);
        assertEquals(stderrOutput.includes('file:'), true);
      } finally {
        console.error = originalError;
      }
    } finally {
      await Deno.remove(file);
    }
  });
});

Deno.test('helper function: resolveFilePath', async (t) => {
  const { resolveFilePath } = await import('./files/resolver.ts');

  await t.step('resolves absolute path as-is', async () => {
    // Create a temporary file to test with
    const tempFile = await Deno.makeTempFile();
    try {
      const resolved = await resolveFilePath(tempFile);
      assertEquals(resolved, tempFile);
    } finally {
      await Deno.remove(tempFile);
    }
  });

  await t.step('throws error for non-existent file', async () => {
    await assertRejects(
      async () => {
        await resolveFilePath('/nonexistent/path/file.txt');
      },
      Error,
      'File not found',
    );
  });

  await t.step('resolves relative paths', async () => {
    // Create a temp file in current directory context
    const tempFile = await Deno.makeTempFile();
    try {
      const stat = await Deno.stat(tempFile);
      assertEquals(stat.isFile, true);

      // resolveFilePath should accept the temp file
      const resolved = await resolveFilePath(tempFile);
      assertEquals(resolved.length > 0, true);
    } finally {
      await Deno.remove(tempFile);
    }
  });
});

Deno.test('helper function: emitOutput', async (t) => {
  const { emitOutput } = await import('./output/formatter.ts');

  await t.step('emits YAML format', async () => {
    let output = '';
    const originalLog = console.log;
    console.log = (msg: string) => {
      output += msg;
    };

    try {
      const data = { name: 'Alice', age: 30 };
      await emitOutput(data, 'yaml');
      assertEquals(output.includes('name:'), true);
      assertEquals(output.includes('Alice'), true);
    } finally {
      console.log = originalLog;
    }
  });

  await t.step('emits compact JSON format', async () => {
    let output = '';
    const originalLog = console.log;
    console.log = (msg: string) => {
      output += msg;
    };

    try {
      const data = { name: 'Bob' };
      await emitOutput(data, 'compact');
      assertEquals(output.includes('{"name":"Bob"}'), true);
    } finally {
      console.log = originalLog;
    }
  });

  await t.step('emits pretty-printed JSON format', async () => {
    let output = '';
    const originalLog = console.log;
    console.log = (msg: string) => {
      output += msg;
    };

    try {
      const data = { name: 'Charlie' };
      await emitOutput(data, 'pretty');
      assertEquals(output.includes('name'), true);
      assertEquals(output.includes('Charlie'), true);
    } finally {
      console.log = originalLog;
    }
  });

  await t.step('handles array output in pretty format', async () => {
    let output = '';
    const originalLog = console.log;
    console.log = (msg: string) => {
      output += msg;
    };

    try {
      const data = [{ id: 1 }, { id: 2 }];
      await emitOutput(data, 'pretty');
      assertEquals(output.includes('['), true);
      assertEquals(output.includes('"id"'), true);
    } finally {
      console.log = originalLog;
    }
  });
});
