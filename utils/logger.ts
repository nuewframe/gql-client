export type LogLevel = 'none' | 'info' | 'debug';

export class Logger {
  private level: LogLevel;

  constructor(level: LogLevel = 'info') {
    this.level = level;
  }

  setLevel(level: LogLevel) {
    this.level = level;
  }

  info(message: string, ...args: unknown[]) {
    if (this.level !== 'none') {
      console.error(`ℹ️  ${message}`, ...args);
    }
  }

  warn(message: string, ...args: unknown[]) {
    if (this.level !== 'none') {
      console.error(`⚠️  ${message}`, ...args);
    }
  }

  debug(message: string, ...args: unknown[]) {
    if (this.level === 'debug') {
      console.error(`🔍 ${message}`, ...args);
    }
  }

  error(message: string, ...args: unknown[]) {
    console.error(`❌ ${message}`, ...args);
  }

  success(message: string, ...args: unknown[]) {
    if (this.level !== 'none') {
      console.error(`✅ ${message}`, ...args);
    }
  }
}
