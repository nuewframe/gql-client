import { assertEquals } from '@std/assert';
import { extractField } from './field-extractor.ts';
import { Logger } from '../../utils/logger.ts';

type ExitException = { exit: true; code: number };

Deno.test('extractField: extracts top-level field', () => {
  const logger = new Logger('none');
  const value = { name: 'John', age: 30 };
  const result = extractField(value, 'name', logger);
  assertEquals(result, 'John');
});

Deno.test('extractField: extracts nested field via dot notation', () => {
  const logger = new Logger('none');
  const value = { user: { profile: { name: 'Jane' } } };
  const result = extractField(value, 'user.profile.name', logger);
  assertEquals(result, 'Jane');
});

Deno.test('extractField: exits when missing field in path', () => {
  const logger = new Logger('none');
  const value = { name: 'John' };
  const originalExit = Deno.exit;
  let capturedExit = false;
  let capturedCode = 0;

  try {
    Deno.exit = ((code: number) => {
      capturedCode = code;
      capturedExit = true;
      throw { exit: true, code } as ExitException;
    }) as unknown as typeof Deno.exit;

    try {
      extractField(value, 'missing', logger);
    } catch (e) {
      if ((e as ExitException)?.exit) {
        // Expected
      }
    }

    assertEquals(capturedExit, true);
    assertEquals(capturedCode, 1);
  } finally {
    Deno.exit = originalExit;
  }
});

Deno.test('extractField: returns array', () => {
  const logger = new Logger('none');
  const value = { items: [{ id: 1 }, { id: 2 }] };
  const result = extractField(value, 'items', logger);
  assertEquals(result, [{ id: 1 }, { id: 2 }]);
});

Deno.test('extractField: exits on non-object property', () => {
  const logger = new Logger('none');
  const value = { data: [1, 2, 3] };
  const originalExit = Deno.exit;
  let capturedExit = false;

  try {
    Deno.exit = ((code: number) => {
      capturedExit = true;
      throw { exit: true, code } as ExitException;
    }) as unknown as typeof Deno.exit;

    try {
      extractField(value, 'data.nested', logger);
    } catch (e) {
      if ((e as ExitException)?.exit) {
        // Expected
      }
    }

    assertEquals(capturedExit, true);
  } finally {
    Deno.exit = originalExit;
  }
});

Deno.test('extractField: exits on null in path', () => {
  const logger = new Logger('none');
  const value = { user: null };
  const originalExit = Deno.exit;
  let capturedExit = false;

  try {
    Deno.exit = ((code: number) => {
      capturedExit = true;
      throw { exit: true, code } as ExitException;
    }) as unknown as typeof Deno.exit;

    try {
      extractField(value, 'user.name', logger);
    } catch (e) {
      if ((e as ExitException)?.exit) {
        // Expected
      }
    }

    assertEquals(capturedExit, true);
  } finally {
    Deno.exit = originalExit;
  }
});
