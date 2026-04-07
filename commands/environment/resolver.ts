import { configExists, getConfig, resolveConfigPath } from '../config.ts';

/** Resolve environment variables from config or use empty set. */
export async function resolveEnvVariables(
  envName: string | undefined,
  envFilePath: string | undefined,
): Promise<{ envName?: string; variables: Record<string, string> }> {
  const cfgExists = await configExists(envFilePath);
  const config = await getConfig(envFilePath);
  const environments = config.environments ?? {};
  const names = Object.keys(environments);

  if (envName) {
    const selected = environments[envName];
    if (!selected) {
      const hint = names.length > 0 ? ` Available: ${names.join(', ')}` : '';
      throw new Error(
        `Environment "${envName}" not found in ${resolveConfigPath(envFilePath)}.${hint}`,
      );
    }
    return { envName, variables: { ...selected } };
  }

  if (config.defaultEnv) {
    const selected = environments[config.defaultEnv];
    if (!selected) {
      throw new Error(
        `Configured defaultEnv "${config.defaultEnv}" was not found in ${
          resolveConfigPath(envFilePath)
        }.`,
      );
    }
    return { envName: config.defaultEnv, variables: { ...selected } };
  }

  if (cfgExists && names.length > 0) {
    throw new Error(
      `No environment selected. Re-run with --env <env name> or set a default via: gql-client config set-default <env name> --env-file ${
        resolveConfigPath(envFilePath)
      }`,
    );
  }

  return { variables: {} };
}
