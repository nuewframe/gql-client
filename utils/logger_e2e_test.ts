import { assertEquals, assertStringIncludes } from '@std/assert';
import { Logger } from './logger.ts';

/**
 * E2E tests for the Logger class.
 * Tests all log levels (none, info, debug) and all methods (info, warn, debug, error, success).
 */

/** Capture console.error calls to verify logging behavior. */
function captureConsoleError(fn: () => void): string[] {
  const messages: string[] = [];
  const originalError = console.error;

  console.error = (...args: unknown[]) => {
    messages.push(args.map((arg) => String(arg)).join(' '));
  };

  try {
    fn();
  } finally {
    console.error = originalError;
  }

  return messages;
}

Deno.test('Logger E2E', async (t) => {
  // ──────────────────────────────────────────────────────────────────────
  // CONSTRUCTOR & LEVEL INITIALIZATION
  // ──────────────────────────────────────────────────────────────────────

  await t.step('Logger constructor uses info as default level', async () => {
    const logger = new Logger();
    const messages = await captureConsoleError(() => {
      logger.info('test message');
    });
    assertEquals(messages.length, 1);
    assertStringIncludes(messages[0], 'test message');
  });

  await t.step('Logger constructor accepts explicit none level', async () => {
    const logger = new Logger('none');
    const messages = await captureConsoleError(() => {
      logger.info('should not appear');
    });
    assertEquals(messages.length, 0);
  });

  await t.step('Logger constructor accepts explicit info level', async () => {
    const logger = new Logger('info');
    const messages = await captureConsoleError(() => {
      logger.info('visible');
    });
    assertEquals(messages.length, 1);
  });

  await t.step('Logger constructor accepts explicit debug level', async () => {
    const logger = new Logger('debug');
    const messages = await captureConsoleError(() => {
      logger.debug('debug visible');
    });
    assertEquals(messages.length, 1);
  });

  // ──────────────────────────────────────────────────────────────────────
  // SETLEVEL METHOD
  // ──────────────────────────────────────────────────────────────────────

  await t.step('setLevel changes logging behavior from info to none', async () => {
    const logger = new Logger('info');
    let messages = await captureConsoleError(() => {
      logger.info('before change');
    });
    assertEquals(messages.length, 1);

    logger.setLevel('none');
    messages = await captureConsoleError(() => {
      logger.info('after change');
    });
    assertEquals(messages.length, 0);
  });

  await t.step('setLevel changes logging behavior from none to info', async () => {
    const logger = new Logger('none');
    let messages = await captureConsoleError(() => {
      logger.info('hidden initially');
    });
    assertEquals(messages.length, 0);

    logger.setLevel('info');
    messages = await captureConsoleError(() => {
      logger.info('now visible');
    });
    assertEquals(messages.length, 1);
  });

  await t.step('setLevel changes logging behavior to debug', async () => {
    const logger = new Logger('info');
    let messages = await captureConsoleError(() => {
      logger.debug('hidden at info');
    });
    assertEquals(messages.length, 0);

    logger.setLevel('debug');
    messages = await captureConsoleError(() => {
      logger.debug('visible at debug');
    });
    assertEquals(messages.length, 1);
  });

  await t.step('setLevel from debug to info hides debug messages', async () => {
    const logger = new Logger('debug');
    let messages = await captureConsoleError(() => {
      logger.debug('visible at debug');
    });
    assertEquals(messages.length, 1);

    logger.setLevel('info');
    messages = await captureConsoleError(() => {
      logger.debug('hidden at info');
    });
    assertEquals(messages.length, 0);
  });

  // ──────────────────────────────────────────────────────────────────────
  // INFO METHOD
  // ──────────────────────────────────────────────────────────────────────

  await t.step('info logs at info level', async () => {
    const logger = new Logger('info');
    const messages = await captureConsoleError(() => {
      logger.info('info message');
    });
    assertEquals(messages.length, 1);
    assertStringIncludes(messages[0], 'ℹ️');
    assertStringIncludes(messages[0], 'info message');
  });

  await t.step('info logs at debug level', async () => {
    const logger = new Logger('debug');
    const messages = await captureConsoleError(() => {
      logger.info('info at debug');
    });
    assertEquals(messages.length, 1);
  });

  await t.step('info does not log at none level', async () => {
    const logger = new Logger('none');
    const messages = await captureConsoleError(() => {
      logger.info('should not appear');
    });
    assertEquals(messages.length, 0);
  });

  await t.step('info includes emoji prefix', async () => {
    const logger = new Logger('info');
    const messages = await captureConsoleError(() => {
      logger.info('test');
    });
    assertStringIncludes(messages[0], 'ℹ️');
  });

  // ──────────────────────────────────────────────────────────────────────
  // WARN METHOD
  // ──────────────────────────────────────────────────────────────────────

  await t.step('warn logs at info level', async () => {
    const logger = new Logger('info');
    const messages = await captureConsoleError(() => {
      logger.warn('warning message');
    });
    assertEquals(messages.length, 1);
    assertStringIncludes(messages[0], '⚠️');
    assertStringIncludes(messages[0], 'warning message');
  });

  await t.step('warn logs at debug level', async () => {
    const logger = new Logger('debug');
    const messages = await captureConsoleError(() => {
      logger.warn('warn at debug');
    });
    assertEquals(messages.length, 1);
  });

  await t.step('warn does not log at none level', async () => {
    const logger = new Logger('none');
    const messages = await captureConsoleError(() => {
      logger.warn('should not appear');
    });
    assertEquals(messages.length, 0);
  });

  await t.step('warn includes warning emoji prefix', async () => {
    const logger = new Logger('info');
    const messages = await captureConsoleError(() => {
      logger.warn('test');
    });
    assertStringIncludes(messages[0], '⚠️');
  });

  // ──────────────────────────────────────────────────────────────────────
  // DEBUG METHOD
  // ──────────────────────────────────────────────────────────────────────

  await t.step('debug logs only at debug level', async () => {
    const logger = new Logger('debug');
    const messages = await captureConsoleError(() => {
      logger.debug('debug message');
    });
    assertEquals(messages.length, 1);
    assertStringIncludes(messages[0], '🔍');
    assertStringIncludes(messages[0], 'debug message');
  });

  await t.step('debug does not log at info level', async () => {
    const logger = new Logger('info');
    const messages = await captureConsoleError(() => {
      logger.debug('hidden');
    });
    assertEquals(messages.length, 0);
  });

  await t.step('debug does not log at none level', async () => {
    const logger = new Logger('none');
    const messages = await captureConsoleError(() => {
      logger.debug('hidden');
    });
    assertEquals(messages.length, 0);
  });

  await t.step('debug includes magnifying glass emoji prefix', async () => {
    const logger = new Logger('debug');
    const messages = await captureConsoleError(() => {
      logger.debug('test');
    });
    assertStringIncludes(messages[0], '🔍');
  });

  // ──────────────────────────────────────────────────────────────────────
  // ERROR METHOD
  // ──────────────────────────────────────────────────────────────────────

  await t.step('error logs at all levels (info)', async () => {
    const logger = new Logger('info');
    const messages = await captureConsoleError(() => {
      logger.error('error message');
    });
    assertEquals(messages.length, 1);
    assertStringIncludes(messages[0], '❌');
    assertStringIncludes(messages[0], 'error message');
  });

  await t.step('error logs at all levels (debug)', async () => {
    const logger = new Logger('debug');
    const messages = await captureConsoleError(() => {
      logger.error('error at debug');
    });
    assertEquals(messages.length, 1);
  });

  await t.step('error logs at all levels (none)', async () => {
    const logger = new Logger('none');
    const messages = await captureConsoleError(() => {
      logger.error('error at none');
    });
    assertEquals(messages.length, 1);
  });

  await t.step('error includes error emoji prefix', async () => {
    const logger = new Logger('info');
    const messages = await captureConsoleError(() => {
      logger.error('test');
    });
    assertStringIncludes(messages[0], '❌');
  });

  // ──────────────────────────────────────────────────────────────────────
  // SUCCESS METHOD
  // ──────────────────────────────────────────────────────────────────────

  await t.step('success logs at info level', async () => {
    const logger = new Logger('info');
    const messages = await captureConsoleError(() => {
      logger.success('success message');
    });
    assertEquals(messages.length, 1);
    assertStringIncludes(messages[0], '✅');
    assertStringIncludes(messages[0], 'success message');
  });

  await t.step('success logs at debug level', async () => {
    const logger = new Logger('debug');
    const messages = await captureConsoleError(() => {
      logger.success('success at debug');
    });
    assertEquals(messages.length, 1);
  });

  await t.step('success does not log at none level', async () => {
    const logger = new Logger('none');
    const messages = await captureConsoleError(() => {
      logger.success('should not appear');
    });
    assertEquals(messages.length, 0);
  });

  await t.step('success includes checkmark emoji prefix', async () => {
    const logger = new Logger('info');
    const messages = await captureConsoleError(() => {
      logger.success('test');
    });
    assertStringIncludes(messages[0], '✅');
  });

  // ──────────────────────────────────────────────────────────────────────
  // MULTIPLE ARGUMENTS
  // ──────────────────────────────────────────────────────────────────────

  await t.step('methods support multiple arguments', async () => {
    const logger = new Logger('info');
    const messages = await captureConsoleError(() => {
      logger.info('message', 'arg1', 'arg2');
    });
    assertEquals(messages.length, 1);
    assertStringIncludes(messages[0], 'message');
  });

  await t.step('debug supports multiple arguments', async () => {
    const logger = new Logger('debug');
    const messages = await captureConsoleError(() => {
      logger.debug('message', { key: 'value' }, 123);
    });
    assertEquals(messages.length, 1);
  });

  // ──────────────────────────────────────────────────────────────────────
  // COMPREHENSIVE LEVEL MATRIX
  // ──────────────────────────────────────────────────────────────────────

  await t.step('at none level: only error logs', async () => {
    const logger = new Logger('none');
    let count = 0;

    count = (await captureConsoleError(() => logger.info('test'))).length;
    assertEquals(count, 0);

    count = (await captureConsoleError(() => logger.warn('test'))).length;
    assertEquals(count, 0);

    count = (await captureConsoleError(() => logger.debug('test'))).length;
    assertEquals(count, 0);

    count = (await captureConsoleError(() => logger.error('test'))).length;
    assertEquals(count, 1);

    count = (await captureConsoleError(() => logger.success('test'))).length;
    assertEquals(count, 0);
  });

  await t.step('at info level: info, warn, error, success log', async () => {
    const logger = new Logger('info');
    let count = 0;

    count = (await captureConsoleError(() => logger.info('test'))).length;
    assertEquals(count, 1);

    count = (await captureConsoleError(() => logger.warn('test'))).length;
    assertEquals(count, 1);

    count = (await captureConsoleError(() => logger.debug('test'))).length;
    assertEquals(count, 0);

    count = (await captureConsoleError(() => logger.error('test'))).length;
    assertEquals(count, 1);

    count = (await captureConsoleError(() => logger.success('test'))).length;
    assertEquals(count, 1);
  });

  await t.step('at debug level: all methods log', async () => {
    const logger = new Logger('debug');
    let count = 0;

    count = (await captureConsoleError(() => logger.info('test'))).length;
    assertEquals(count, 1);

    count = (await captureConsoleError(() => logger.warn('test'))).length;
    assertEquals(count, 1);

    count = (await captureConsoleError(() => logger.debug('test'))).length;
    assertEquals(count, 1);

    count = (await captureConsoleError(() => logger.error('test'))).length;
    assertEquals(count, 1);

    count = (await captureConsoleError(() => logger.success('test'))).length;
    assertEquals(count, 1);
  });
});
