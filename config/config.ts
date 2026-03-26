import { join } from '@std/path';

export interface GqlConfig {
  defaultEnv?: string;
  environments?: Record<
    string,
    {
      endpoint?: string;
      headers?: Record<string, string>;
    }
  >;
}

const CONFIG_PATH = join(Deno.env.get('HOME') || '.', '.gql-client', 'config.json');

export function getConfig(): GqlConfig {
  try {
    const content = Deno.readTextFileSync(CONFIG_PATH);
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

export function saveConfig(config: GqlConfig): void {
  const dir = join(Deno.env.get('HOME') || '.', '.gql-client');
  Deno.mkdirSync(dir, { recursive: true });
  Deno.writeTextFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}
