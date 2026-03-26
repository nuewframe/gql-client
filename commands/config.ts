import { Command } from '@cliffy/command';
import { getConfig, saveConfig } from '../config/config.ts';

export const configCommand = new Command()
  .description('Manage gql-client configuration')
  .command('show', 'Show current configuration')
  .action(() => {
    const config = getConfig();
    console.log('🔧 Current configuration:');
    console.log(JSON.stringify(config, null, 2));
  })
  .command('set-env', 'Set default environment')
  .arguments('<env:string>')
  .action((_options, env) => {
    const config = getConfig();
    config.defaultEnv = env;
    saveConfig(config);
    console.log(`✅ Default environment set to: ${env}`);
  });
