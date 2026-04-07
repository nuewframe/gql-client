/** Resolve {{ $(...) }} command substitution tokens in a string. */
export function executeCommandTokens(text: string): string {
  return text.replace(/\{\{\s*\$\(([^)]+)\)\s*\}\}/g, (match, cmd) => {
    try {
      // WARNING: executes shell commands from .http files.
      // Only called when --allow-commands is explicitly passed by the user.
      const result = new Deno.Command('sh', {
        args: ['-c', cmd.trim()],
        stdout: 'piped',
        stderr: 'piped',
      }).outputSync();
      return result.success ? new TextDecoder().decode(result.stdout).trim() : match;
    } catch {
      return match;
    }
  });
}
