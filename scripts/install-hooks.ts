const installHint = 'https://docs.deno.com/runtime/getting_started/installation/';
const managedMarker = '# managed by install-hooks.ts';
const reinstallHint = '# Re-install: deno task hooks';

async function runGit(args: string[], cwd?: string): Promise<{ code: number; stdout: string }> {
  const command = new Deno.Command('git', {
    args,
    cwd,
    stdout: 'piped',
    stderr: 'null',
  });
  const output = await command.output();
  return {
    code: output.code,
    stdout: new TextDecoder().decode(output.stdout).trim(),
  };
}

function buildHookContent(): string {
  return `#!/usr/bin/env sh
${managedMarker}
${reinstallHint}

set -eu

if ! command -v deno >/dev/null 2>&1; then
  printf '\\033[31m✗ pre-push: deno is not installed on PATH\\033[0m\\n' >&2
  printf '  Install from ${installHint}\\n' >&2
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  printf '\\033[31m✗ pre-push: not inside a git repository\\033[0m\\n' >&2
  exit 1
}
cd "$REPO_ROOT"

printf '▶ pre-push: fmt check...\\n'
deno task fmt:check

printf '▶ pre-push: lint...\\n'
deno task lint

printf '▶ pre-push: test...\\n'
deno task test

printf '\\033[32m✓ All checks passed\\033[0m\\n'
`;
}

try {
  const gitVersionResult = await runGit(['--version']);
  if (gitVersionResult.code !== 0 || !gitVersionResult.stdout) {
    console.error('Error: git is not installed or not available on PATH.');
    Deno.exit(1);
  }

  const repoRootResult = await runGit(['rev-parse', '--show-toplevel']);
  if (repoRootResult.code !== 0 || !repoRootResult.stdout) {
    console.error('\x1b[31m✗ Not inside a git repository\x1b[0m');
    Deno.exit(1);
  }
  const repoRoot = repoRootResult.stdout;

  const gitDirResult = await runGit(['rev-parse', '--git-dir'], repoRoot);
  if (gitDirResult.code !== 0 || !gitDirResult.stdout) {
    console.error('\x1b[31m✗ Failed to determine git directory\x1b[0m');
    Deno.exit(1);
  }

  const hooksPathResult = await runGit(['config', '--get', 'core.hooksPath'], repoRoot);
  const hooksPath = hooksPathResult.code === 0 ? hooksPathResult.stdout : '';
  const hooksDir = hooksPath
    ? (hooksPath.startsWith('/') || /^[A-Za-z]:[\\/]/.test(hooksPath)
      ? hooksPath
      : `${repoRoot}/${hooksPath}`)
    : `${repoRoot}/${gitDirResult.stdout}/hooks`;

  await Deno.mkdir(hooksDir, { recursive: true });

  const hookPath = `${hooksDir}/pre-push`;

  let existingHook: string | null = null;
  try {
    existingHook = await Deno.readTextFile(hookPath);
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
      throw error;
    }
  }

  if (existingHook !== null && !existingHook.includes(managedMarker)) {
    console.error('Warning: existing pre-push hook is not managed by install-hooks.ts');
    console.error(`  Backed up to: ${hookPath}.bak`);
    await Deno.copyFile(hookPath, `${hookPath}.bak`);
  }

  await Deno.writeTextFile(hookPath, buildHookContent());

  if (Deno.build.os !== 'windows') {
    await Deno.chmod(hookPath, 0o755);
  }

  console.log('\x1b[32m✓ pre-push hook installed\x1b[0m');
  console.log(`  Location : ${hookPath}`);
  console.log('  Bypass   : git push --no-verify');
} catch (error) {
  if (error instanceof Deno.errors.NotFound) {
    console.error('Error: git is not installed or not available on PATH.');
    Deno.exit(1);
  }

  console.error(error instanceof Error ? error.message : String(error));
  Deno.exit(1);
}
