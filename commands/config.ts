import { Command } from '@cliffy/command';
import { dirname, isAbsolute, join, resolve } from '@std/path';
import { stringify as yamlStringify } from '@std/yaml';

export interface GqlConfig {
  defaultEnv?: string;
  environments?: Record<string, Record<string, string>>;
}

export const DEFAULT_CONFIG_DIR = join(Deno.env.get('HOME') || '.', '.nuewframe', 'gql-client');
export const DEFAULT_CONFIG_PATH = join(DEFAULT_CONFIG_DIR, 'config.json');

export function resolveConfigPath(configPath?: string): string {
  if (!configPath) return DEFAULT_CONFIG_PATH;
  return isAbsolute(configPath) ? configPath : resolve(Deno.cwd(), configPath);
}

export async function configExists(configPath?: string): Promise<boolean> {
  try {
    const stat = await Deno.stat(resolveConfigPath(configPath));
    return stat.isFile;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}

export async function getConfig(configPath?: string): Promise<GqlConfig> {
  const resolvedConfigPath = resolveConfigPath(configPath);
  try {
    const content = await Deno.readTextFile(resolvedConfigPath);
    return JSON.parse(content);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return {};
    }
    throw new Error(
      `Failed to load gql-client config from ${resolvedConfigPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export async function saveConfig(config: GqlConfig, configPath?: string): Promise<void> {
  const resolvedConfigPath = resolveConfigPath(configPath);
  await Deno.mkdir(dirname(resolvedConfigPath), { recursive: true });
  await Deno.writeTextFile(resolvedConfigPath, JSON.stringify(config, null, 2));
}

export const configCommand = new Command()
  .description('Manage gql-client configuration');

configCommand
  .command('show')
  .description('Show current configuration')
  .option('--env-file <file:string>', 'Path to a config.json file')
  .option(
    '-o, --output <format:string>',
    'Output format: yaml (default), json, compact',
    { default: 'yaml' },
  )
  .action(async (options) => {
    const config = await getConfig(options.envFile);
    const fmt = options.output as 'yaml' | 'json' | 'compact';
    if (fmt === 'json') {
      console.log(JSON.stringify(config, null, 2));
    } else if (fmt === 'compact') {
      console.log(JSON.stringify(config));
    } else {
      console.log(yamlStringify(config as unknown as Record<string, unknown>));
    }
  });

configCommand
  .command('set-default')
  .description('Set the default environment used by run')
  .option('--env-file <file:string>', 'Path to a config.json file')
  .arguments('<env:string>')
  .action(async (options, env) => {
    const config = await getConfig(options.envFile);
    const environments = config.environments ?? {};

    if (!environments[env]) {
      const available = Object.keys(environments);
      console.error(
        available.length > 0
          ? `❌ Environment "${env}" not found. Available: ${available.join(', ')}`
          : '❌ No environments are defined in the config file.',
      );
      Deno.exit(1);
    }

    config.defaultEnv = env;
    await saveConfig(config, options.envFile);
    console.error(`Default environment set to: ${env}`);
  });
