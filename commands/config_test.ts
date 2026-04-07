import { assertEquals, assertRejects } from '@std/assert';
import {
  configExists,
  DEFAULT_CONFIG_PATH,
  getConfig,
  type GqlConfig,
  resolveConfigPath,
  saveConfig,
} from './config.ts';

Deno.test('config: resolveConfigPath with default', () => {
  const resolved = resolveConfigPath();
  assertEquals(resolved, DEFAULT_CONFIG_PATH);
});

Deno.test('config: resolveConfigPath with absolute path', () => {
  const resolved = resolveConfigPath('/absolute/path/config.json');
  assertEquals(resolved, '/absolute/path/config.json');
});

Deno.test('config: resolveConfigPath with relative path', () => {
  const cwd = Deno.cwd();
  const resolved = resolveConfigPath('config.json');
  assertEquals(resolved, `${cwd}/config.json`);
});

Deno.test('config: configExists returns false for non-existent file', async () => {
  const exists = await configExists('/non/existent/path.json');
  assertEquals(exists, false);
});

Deno.test('config: configExists returns true for existing file', async () => {
  const tempDir = await Deno.makeTempDir();
  const testFile = `${tempDir}/config.json`;
  await Deno.writeTextFile(testFile, '{}');

  const exists = await configExists(testFile);
  assertEquals(exists, true);

  await Deno.remove(tempDir, { recursive: true });
});

Deno.test('config: getConfig returns empty object for non-existent file', async () => {
  const config = await getConfig('/non/existent/config.json');
  assertEquals(config, {});
});

Deno.test('config: getConfig parses valid JSON', async () => {
  const tempDir = await Deno.makeTempDir();
  const testFile = `${tempDir}/config.json`;
  const testConfig: GqlConfig = {
    defaultEnv: 'prod',
    environments: {
      prod: { endpoint: 'https://api.prod.com' },
    },
  };
  await Deno.writeTextFile(testFile, JSON.stringify(testConfig));

  const config = await getConfig(testFile);
  assertEquals(config, testConfig);

  await Deno.remove(tempDir, { recursive: true });
});

Deno.test('config: getConfig throws for invalid JSON', async () => {
  const tempDir = await Deno.makeTempDir();
  const testFile = `${tempDir}/bad.json`;
  await Deno.writeTextFile(testFile, '{invalid json}');

  await assertRejects(
    () => getConfig(testFile),
    Error,
    'Failed to load gql-client config',
  );

  await Deno.remove(tempDir, { recursive: true });
});

Deno.test('config: saveConfig creates config file', async () => {
  const tempDir = await Deno.makeTempDir();
  const testFile = `${tempDir}/subdir/config.json`;
  const testConfig: GqlConfig = {
    defaultEnv: 'dev',
    environments: {
      dev: { endpoint: 'https://api.dev.com' },
    },
  };

  await saveConfig(testConfig, testFile);

  const content = await Deno.readTextFile(testFile);
  const parsed = JSON.parse(content);
  assertEquals(parsed, testConfig);

  await Deno.remove(tempDir, { recursive: true });
});

Deno.test('config: saveConfig creates nested directories', async () => {
  const tempDir = await Deno.makeTempDir();
  const testFile = `${tempDir}/a/b/c/config.json`;
  const testConfig: GqlConfig = { defaultEnv: 'test' };

  await saveConfig(testConfig, testFile);

  const exists = await configExists(testFile);
  assertEquals(exists, true);

  await Deno.remove(tempDir, { recursive: true });
});
