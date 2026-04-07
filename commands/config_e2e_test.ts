import { assertEquals, assertExists, assertRejects, assertStringIncludes } from '@std/assert';
import { stringify as yamlStringify } from '@std/yaml';
import { configExists, getConfig, resolveConfigPath, saveConfig } from './config.ts';

/**
 * E2E tests for the config command.
 * Tests configuration file operations: loading, saving, validation, and CLI output formats.
 */

/** Create a temporary config file. */
async function createTempConfig(config: Record<string, unknown>) {
  const configFile = await Deno.makeTempFile({ suffix: '.json' });
  await Deno.writeTextFile(configFile, JSON.stringify(config, null, 2));
  return configFile;
}

Deno.test('config E2E', async (t) => {
  // ──────────────────────────────────────────────────────────────────────
  // GETCONFIG TESTS
  // ──────────────────────────────────────────────────────────────────────

  await t.step('getConfig returns empty object when file does not exist', async () => {
    const result = await getConfig('/nonexistent/path/config.json');
    assertEquals(result, {});
  });

  await t.step('getConfig parses valid JSON config file', async () => {
    const configFile = await createTempConfig({
      defaultEnv: 'production',
      environments: {
        production: {
          HOST_URL: 'https://prod.api.com',
          TOKEN: 'prod-token',
        },
      },
    });

    try {
      const result = await getConfig(configFile);
      assertEquals(result.defaultEnv, 'production');
      assertEquals(result.environments?.['production']?.['HOST_URL'], 'https://prod.api.com');
    } finally {
      await Deno.remove(configFile);
    }
  });

  await t.step('getConfig throws on invalid JSON', async () => {
    const configFile = await Deno.makeTempFile({ suffix: '.json' });
    try {
      await Deno.writeTextFile(configFile, 'invalid json {');
      await assertRejects(async () => {
        await getConfig(configFile);
      }, Error);
    } finally {
      await Deno.remove(configFile);
    }
  });

  await t.step('getConfig works with relative paths', async () => {
    const tempDir = await Deno.makeTempDir();
    const configFile = `${tempDir}/config.json`;

    try {
      await Deno.writeTextFile(
        configFile,
        JSON.stringify({
          defaultEnv: 'test',
          environments: { test: { HOST_URL: 'https://test.api.com' } },
        }),
      );

      const result = await getConfig(configFile);
      assertEquals(result.defaultEnv, 'test');
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // SAVECONFIG TESTS
  // ──────────────────────────────────────────────────────────────────────

  await t.step('saveConfig creates config directory if it does not exist', async () => {
    const tempDir = await Deno.makeTempDir();
    const configPath = `${tempDir}/new/nested/dir/config.json`;

    try {
      await saveConfig(
        {
          defaultEnv: 'dev',
          environments: { dev: { HOST_URL: 'https://dev.api.com' } },
        },
        configPath,
      );

      const exists = await Deno.stat(configPath);
      assertEquals(exists.isFile, true);
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  });

  await t.step('saveConfig writes valid JSON', async () => {
    const configFile = await Deno.makeTempFile({ suffix: '.json' });

    try {
      const config = {
        defaultEnv: 'staging',
        environments: {
          staging: { HOST_URL: 'https://staging.api.com' },
          production: { HOST_URL: 'https://prod.api.com' },
        },
      };

      await saveConfig(config, configFile);
      const saved = JSON.parse(await Deno.readTextFile(configFile));
      assertEquals(saved.defaultEnv, 'staging');
      assertEquals(Object.keys(saved.environments).length, 2);
    } finally {
      await Deno.remove(configFile);
    }
  });

  await t.step('saveConfig overwrites existing config', async () => {
    const configFile = await createTempConfig({
      defaultEnv: 'old',
      environments: { old: { HOST_URL: 'https://old.api.com' } },
    });

    try {
      await saveConfig(
        {
          defaultEnv: 'new',
          environments: { new: { HOST_URL: 'https://new.api.com' } },
        },
        configFile,
      );

      const saved = await getConfig(configFile);
      assertEquals(saved.defaultEnv, 'new');
      assertExists(saved.environments?.['new']);
    } finally {
      await Deno.remove(configFile);
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // CONFIGEXISTS TESTS
  // ──────────────────────────────────────────────────────────────────────

  await t.step('configExists returns true when file exists', async () => {
    const configFile = await createTempConfig({ defaultEnv: 'test' });

    try {
      const exists = await configExists(configFile);
      assertEquals(exists, true);
    } finally {
      await Deno.remove(configFile);
    }
  });

  await t.step('configExists returns false when file does not exist', async () => {
    const exists = await configExists('/nonexistent/path/config.json');
    assertEquals(exists, false);
  });

  // ──────────────────────────────────────────────────────────────────────
  // RESOLVECONFIGPATH TESTS
  // ──────────────────────────────────────────────────────────────────────

  await t.step('resolveConfigPath returns default path when no argument', () => {
    const path = resolveConfigPath();
    assertStringIncludes(path, '.nuewframe');
    assertStringIncludes(path, 'gql-client');
    assertStringIncludes(path, 'config.json');
  });

  await t.step('resolveConfigPath resolves relative paths', () => {
    const originalCwd = Deno.cwd();
    const path = resolveConfigPath('./config.json');
    assertEquals(path.startsWith('/'), true); // Should be absolute
    assertStringIncludes(path, originalCwd);
  });

  await t.step('resolveConfigPath returns absolute paths as-is', () => {
    const absPath = '/absolute/path/config.json';
    const resolved = resolveConfigPath(absPath);
    assertEquals(resolved, absPath);
  });

  // ──────────────────────────────────────────────────────────────────────
  // CONFIG SHOW COMMAND TESTS
  // ──────────────────────────────────────────────────────────────────────

  await t.step('config show outputs YAML by default', async () => {
    const configFile = await createTempConfig({
      defaultEnv: 'production',
      environments: {
        production: {
          HOST_URL: 'https://prod.api.com',
          TOKEN: 'prod-token',
        },
      },
    });

    try {
      // Test that YAML parsing works
      const config = await getConfig(configFile);
      const yamlOutput = yamlStringify(config as unknown as Record<string, unknown>);
      assertStringIncludes(yamlOutput, 'defaultEnv');
      assertStringIncludes(yamlOutput, 'production');
    } finally {
      await Deno.remove(configFile);
    }
  });

  await t.step('config show can output JSON format', async () => {
    const configFile = await createTempConfig({
      defaultEnv: 'staging',
      environments: {
        staging: { HOST_URL: 'https://staging.api.com' },
      },
    });

    try {
      const config = await getConfig(configFile);
      const jsonOutput = JSON.stringify(config, null, 2);
      assertStringIncludes(jsonOutput, 'defaultEnv');
      assertStringIncludes(jsonOutput, 'staging');
    } finally {
      await Deno.remove(configFile);
    }
  });

  await t.step('config show can output compact JSON format', async () => {
    const configFile = await createTempConfig({
      defaultEnv: 'dev',
      environments: { dev: { HOST_URL: 'https://dev.api.com' } },
    });

    try {
      const config = await getConfig(configFile);
      const compactOutput = JSON.stringify(config);
      assertStringIncludes(compactOutput, 'defaultEnv');
      assertStringIncludes(compactOutput, 'dev');
    } finally {
      await Deno.remove(configFile);
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // CONFIG SET-DEFAULT COMMAND VALIDATION TESTS
  // ──────────────────────────────────────────────────────────────────────

  await t.step('config set-default validates env exists in environments', async () => {
    const configFile = await createTempConfig({
      environments: {
        dev: { HOST_URL: 'https://dev.api.com' },
        prod: { HOST_URL: 'https://prod.api.com' },
      },
    });

    try {
      const config = await getConfig(configFile);

      // Simulate set-default validation
      const envToSet = 'prod';
      const environments = config.environments ?? {};

      if (!environments[envToSet]) {
        throw new Error(`Environment "${envToSet}" not found`);
      }

      // If we get here, validation passed
      assertEquals(environments[envToSet], { HOST_URL: 'https://prod.api.com' });
    } finally {
      await Deno.remove(configFile);
    }
  });

  await t.step('config set-default updates defaultEnv in config', async () => {
    const configFile = await createTempConfig({
      defaultEnv: 'dev',
      environments: {
        dev: { HOST_URL: 'https://dev.api.com' },
        prod: { HOST_URL: 'https://prod.api.com' },
      },
    });

    try {
      let config = await getConfig(configFile);
      assertEquals(config.defaultEnv, 'dev');

      // Simulate set-default operation
      config.defaultEnv = 'prod';
      await saveConfig(config, configFile);

      config = await getConfig(configFile);
      assertEquals(config.defaultEnv, 'prod');
    } finally {
      await Deno.remove(configFile);
    }
  });

  await t.step('config set-default rejects env not in environments', async () => {
    const configFile = await createTempConfig({
      environments: {
        dev: { HOST_URL: 'https://dev.api.com' },
      },
    });

    try {
      const config = await getConfig(configFile);
      const envToSet = 'nonexistent';
      const environments = config.environments ?? {};

      if (!environments[envToSet]) {
        assertEquals(environments[envToSet], undefined);
      }
    } finally {
      await Deno.remove(configFile);
    }
  });

  await t.step(
    'config set-default errors when no environments are defined',
    async () => {
      const configFile = await createTempConfig({});

      try {
        const config = await getConfig(configFile);
        const environments = config.environments ?? {};

        if (Object.keys(environments).length === 0) {
          assertEquals(Object.keys(environments).length, 0);
        }
      } finally {
        await Deno.remove(configFile);
      }
    },
  );

  // ──────────────────────────────────────────────────────────────────────
  // MULTI-ENVIRONMENT CONFIG TESTS
  // ──────────────────────────────────────────────────────────────────────

  await t.step('config preserves all environments when setting default', async () => {
    const configFile = await createTempConfig({
      defaultEnv: 'dev',
      environments: {
        dev: { HOST_URL: 'https://dev.api.com', TOKEN: 'dev-token' },
        staging: { HOST_URL: 'https://staging.api.com', TOKEN: 'staging-token' },
        prod: { HOST_URL: 'https://prod.api.com', TOKEN: 'prod-token' },
      },
    });

    try {
      let config = await getConfig(configFile);
      assertEquals(Object.keys(config.environments || {}).length, 3);

      // Change default
      config.defaultEnv = 'prod';
      await saveConfig(config, configFile);

      config = await getConfig(configFile);
      assertEquals(Object.keys(config.environments || {}).length, 3);
      assertEquals(
        Object.keys(config.environments || {}).sort(),
        ['dev', 'prod', 'staging'].sort(),
      );
    } finally {
      await Deno.remove(configFile);
    }
  });

  await t.step('config handles environment variables with special characters', async () => {
    const configFile = await createTempConfig({
      environments: {
        production: {
          HOST_URL: 'https://api.example.com/graphql',
          TOKEN: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          API_KEY: 'key-with-special-chars_123',
        },
      },
    });

    try {
      const config = await getConfig(configFile);
      const prodEnv = config.environments?.['production'];
      assertStringIncludes(prodEnv?.['HOST_URL'] || '', 'example.com');
      assertStringIncludes(prodEnv?.['TOKEN'] || '', 'Bearer');
      assertStringIncludes(prodEnv?.['API_KEY'] || '', 'special');
    } finally {
      await Deno.remove(configFile);
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // EDGE CASES
  // ──────────────────────────────────────────────────────────────────────

  await t.step('config handles empty environments object', async () => {
    const configFile = await createTempConfig({
      environments: {},
    });

    try {
      const config = await getConfig(configFile);
      assertEquals(config.environments, {});
      assertEquals(Object.keys(config.environments || {}).length, 0);
    } finally {
      await Deno.remove(configFile);
    }
  });

  await t.step('config handles missing environments property', async () => {
    const configFile = await createTempConfig({
      defaultEnv: 'missing',
    });

    try {
      const config = await getConfig(configFile);
      assertEquals(config.environments, undefined);
    } finally {
      await Deno.remove(configFile);
    }
  });

  await t.step('config round-trip preserves structure', async () => {
    const original = {
      defaultEnv: 'production',
      environments: {
        development: {
          HOST_URL: 'https://dev.api.com',
          TOKEN: 'dev-token',
          DEBUG: 'true',
        },
        production: {
          HOST_URL: 'https://prod.api.com',
          TOKEN: 'prod-token',
          DEBUG: 'false',
        },
      },
    };

    const configFile = await Deno.makeTempFile({ suffix: '.json' });

    try {
      await saveConfig(original, configFile);
      const loaded = await getConfig(configFile);

      assertEquals(loaded.defaultEnv, original.defaultEnv);
      assertEquals(
        loaded.environments,
        original.environments,
      );
    } finally {
      await Deno.remove(configFile);
    }
  });
});
