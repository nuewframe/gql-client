import { Command } from '@cliffy/command';
import { join } from '@std/path';
import { stringify as yamlStringify } from '@std/yaml';

export type GqlConfig = Record<string, never>;

const CONFIG_DIR = join(Deno.env.get('HOME') || '.', '.nuewframe', 'gql-client');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

export async function getConfig(): Promise<GqlConfig> {
  try {
    const content = await Deno.readTextFile(CONFIG_PATH);
    return JSON.parse(content);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return {};
    }
    throw new Error(
      `Failed to load gql-client config from ${CONFIG_PATH}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export async function saveConfig(config: GqlConfig): Promise<void> {
  await Deno.mkdir(CONFIG_DIR, { recursive: true });
  await Deno.writeTextFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export const configCommand = new Command()
  .description('Manage gql-client configuration');

configCommand
  .command('show')
  .description('Show current configuration')
  .option(
    '-o, --output <format:string>',
    'Output format: yaml (default), json, compact',
    { default: 'yaml' },
  )
  .action(async (options) => {
    const config = await getConfig();
    const fmt = options.output as 'yaml' | 'json' | 'compact';
    if (fmt === 'json') {
      console.log(JSON.stringify(config, null, 2));
    } else if (fmt === 'compact') {
      console.log(JSON.stringify(config));
    } else {
      console.log(yamlStringify(config as unknown as Record<string, unknown>));
    }
  });
