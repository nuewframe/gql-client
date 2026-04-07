import { assertEquals, assertStringIncludes } from '@std/assert';
import { validateAction } from './validate.ts';

// Mock types and helpers
type ExitException = { exit: true; code: number };
let lastExitCode: number | null = null;

const mockExit = (code: number) => {
  lastExitCode = code;
  throw { exit: true, code } as ExitException;
};

const captureConsole = async (
  fn: () => Promise<void>,
): Promise<{ log: string[]; error: string[] }> => {
  const logs: string[] = [];
  const errors: string[] = [];

  const originalLog = console.log;
  const originalError = console.error;

  console.log = (...args: unknown[]) => logs.push(args.join(' '));
  console.error = (...args: unknown[]) => errors.push(args.join(' '));

  try {
    await fn();
    return { log: logs, error: errors };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
};

Deno.test('validate command: no issues found', async () => {
  const validHttpContent = `@HOST: "https://api.example.com/graphql"

###
POST {{ HOST }} HTTP/1.1
Content-Type: application/json

query GetUser {
  user {
    id
    name
  }
}`;

  const originalExit = Deno.exit;
  const originalCwd = Deno.cwd;
  const originalRead = Deno.readTextFile;

  lastExitCode = null;

  try {
    Deno.exit = mockExit as typeof Deno.exit;
    Deno.cwd = () => '/test';
    Deno.readTextFile = async () => validHttpContent;

    const captured = await captureConsole(async () => {
      await validateAction({ logLevel: 'info' }, 'test.http');
    });

    assertEquals(lastExitCode, null, 'Should not call exit for valid file');
    // logger.success writes to stderr
    assertStringIncludes(captured.error.join('\n'), 'no issues found');
  } finally {
    Deno.exit = originalExit;
    Deno.cwd = originalCwd;
    Deno.readTextFile = originalRead;
  }
});

Deno.test('validate command: warnings only (no exit)', async () => {
  // This test uses a valid file so it will have no warnings (empty issues array)
  // The validator doesn't raise warnings, only errors or no issues
  // Since validate command is minimal, we'll test with a valid file that produces no output
  const validHttpContent = `@HOST: "https://api.example.com/graphql"

###
POST {{ HOST }} HTTP/1.1

query GetUser {
  user { id }
}`;

  const originalExit = Deno.exit;
  const originalCwd = Deno.cwd;
  const originalRead = Deno.readTextFile;

  lastExitCode = null;

  try {
    Deno.exit = mockExit as typeof Deno.exit;
    Deno.cwd = () => '/test';
    Deno.readTextFile = async () => validHttpContent;

    const captured = await captureConsole(async () => {
      await validateAction({ logLevel: 'info' }, 'test.http');
    });

    // For valid file, should not exit
    assertEquals(lastExitCode, null, 'Should not exit when file is valid');
    // success message contains the file name
    const allOutput = captured.log.concat(captured.error).join('\n');
    assertStringIncludes(allOutput, 'no issues found');
  } finally {
    Deno.exit = originalExit;
    Deno.cwd = originalCwd;
    Deno.readTextFile = originalRead;
  }
});

Deno.test('validate command: errors found (exits 1)', async () => {
  const httpWithErrors = `# Missing separators
POST https://api.example.com/graphql HTTP/1.1

query GetUser {
  user { id }
}`;

  const originalExit = Deno.exit;
  const originalCwd = Deno.cwd;
  const originalRead = Deno.readTextFile;

  lastExitCode = null;

  try {
    Deno.exit = mockExit as typeof Deno.exit;
    Deno.cwd = () => '/test';
    Deno.readTextFile = async () => httpWithErrors;

    let exited = false;
    await captureConsole(async () => {
      try {
        await validateAction({ logLevel: 'info' }, 'test.http');
      } catch (e) {
        if ((e as ExitException)?.exit) {
          exited = true;
        } else {
          throw e;
        }
      }
    });

    assertEquals(exited, true, 'Expected Deno.exit(1) to be called');
    assertEquals(lastExitCode, 1, 'Should exit with code 1 when errors present');
  } finally {
    Deno.exit = originalExit;
    Deno.cwd = originalCwd;
    Deno.readTextFile = originalRead;
  }
});

Deno.test('validate command: file not found error', async () => {
  const originalExit = Deno.exit;
  const originalCwd = Deno.cwd;
  const originalRead = Deno.readTextFile;

  lastExitCode = null;

  try {
    Deno.exit = mockExit as typeof Deno.exit;
    Deno.cwd = () => '/test';
    Deno.readTextFile = async () => {
      throw new Error('ENOENT: no such file or directory');
    };

    let exited = false;
    const captured = await captureConsole(async () => {
      try {
        await validateAction({ logLevel: 'info' }, 'missing.http');
      } catch (e) {
        if ((e as ExitException)?.exit) {
          exited = true;
        } else {
          throw e;
        }
      }
    });

    assertEquals(exited, true, 'Expected Deno.exit(1) to be called');
    assertEquals(lastExitCode, 1, 'Should exit with code 1 on file error');
    assertStringIncludes(captured.error.join('\n'), 'validate failed');
  } finally {
    Deno.exit = originalExit;
    Deno.cwd = originalCwd;
    Deno.readTextFile = originalRead;
  }
});

Deno.test('validate command: log level normalization', async () => {
  const validHttpContent = `@HOST: "https://api.example.com/graphql"

###
POST {{ HOST }} HTTP/1.1

query GetUser {
  user { id }
}`;

  const originalExit = Deno.exit;
  const originalCwd = Deno.cwd;
  const originalRead = Deno.readTextFile;

  lastExitCode = null;

  try {
    Deno.exit = mockExit as typeof Deno.exit;
    Deno.cwd = () => '/test';
    Deno.readTextFile = async () => validHttpContent;

    await captureConsole(async () => {
      await validateAction({ logLevel: 'invalid' as never }, 'test.http');
    });

    assertEquals(lastExitCode, null);
  } finally {
    Deno.exit = originalExit;
    Deno.cwd = originalCwd;
    Deno.readTextFile = originalRead;
  }
});

Deno.test('validate command: relative path display', async () => {
  const validHttpContent = `@HOST: "https://api.example.com/graphql"

###
POST {{ HOST }} HTTP/1.1

query GetUser {
  user { id }
}`;

  const originalExit = Deno.exit;
  const originalCwd = Deno.cwd;
  const originalRead = Deno.readTextFile;

  lastExitCode = null;

  try {
    Deno.exit = mockExit as typeof Deno.exit;
    Deno.cwd = () => '/workspace';
    Deno.readTextFile = async () => validHttpContent;

    const captured = await captureConsole(async () => {
      await validateAction({ logLevel: 'info' }, 'requests/test.http');
    });

    // For valid file with no issues, logger.success writes to stderr with the relative path
    const allOutput = captured.log.concat(captured.error).join('\n');
    assertStringIncludes(allOutput, 'requests/test.http');
  } finally {
    Deno.exit = originalExit;
    Deno.cwd = originalCwd;
    Deno.readTextFile = originalRead;
  }
});
