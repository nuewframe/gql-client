import { Command } from '@cliffy/command';
import { join } from '@std/path';

export interface Credentials {
  access_token: string;
  id_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  refresh_token?: string;
  timestamp: string;
}

export async function loadCredentials(silent = false): Promise<Credentials | null> {
  try {
    const home = Deno.env.get('HOME');
    if (!home) {
      if (!silent) console.error('⚠️  HOME environment variable not set');
      return null;
    }

    const credentialPath = join(home, '.nuewframe', 'credential.json');

    const content = await Deno.readTextFile(credentialPath);
    const credentials: Credentials = JSON.parse(content);

    // Check if token is expired
    const timestamp = new Date(credentials.timestamp);
    const expiresAt = new Date(timestamp.getTime() + credentials.expires_in * 1000);
    const now = new Date();

    if (now > expiresAt) {
      if (!silent) {
        console.error("⚠️  Token has expired. Please run 'okta-client login' to refresh.");
      }
      return null;
    }

    return credentials;
  } catch (_error) {
    // Silently fail if credentials don't exist or can't be read
    return null;
  }
}

export const authCommand = new Command()
  .description('Manage authentication')
  .command('status', 'Check authentication status')
  .action(async () => {
    const credentials = await loadCredentials();
    if (credentials) {
      console.log('✅ Valid credentials found');
      console.log(`🔑 Token type: ${credentials.token_type}`);
      console.log(`⏰ Expires in: ${credentials.expires_in} seconds`);
      console.log(`🎯 Scope: ${credentials.scope}`);
    } else {
      console.log('❌ No valid credentials found');
      console.log("💡 Run 'okta-client login' to authenticate");
    }
  })
  .command('clear', 'Clear stored credentials')
  .action(async () => {
    try {
      const home = Deno.env.get('HOME');
      if (!home) {
        console.error('❌ HOME environment variable not set');
        Deno.exit(1);
      }

      const credentialPath = `${home}/.nuewframe/credential.json`;
      await Deno.remove(credentialPath);
      console.log('✅ Credentials cleared');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('❌ Failed to clear credentials:', message);
      Deno.exit(1);
    }
  });
