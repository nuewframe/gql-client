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
