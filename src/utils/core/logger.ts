/**
 * Lightweight logger utility for React Native
 * Automatically gates logging behind __DEV__ checks to avoid production overhead
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerConfig {
  enabled: boolean;
  level: LogLevel;
  prefix?: string;
}

class Logger {
  private config: LoggerConfig;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      enabled: __DEV__,
      level: 'info',
      ...config,
    };
  }

  private shouldLog(level: LogLevel): boolean {
    if (!this.config.enabled) return false;
    
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(this.config.level);
    const messageLevelIndex = levels.indexOf(level);
    
    return messageLevelIndex >= currentLevelIndex;
  }

  private formatMessage(level: LogLevel, message: string, ...args: any[]): [string, ...any[]] {
    const timestamp = new Date().toISOString().substr(11, 12);
    const prefix = this.config.prefix ? `[${this.config.prefix}]` : '';
    const levelEmoji = {
      debug: '🔍',
      info: 'ℹ️',
      warn: '⚠️',
      error: '❌',
    }[level];
    
    const formattedMessage = `${levelEmoji} ${prefix} ${message}`;
    return [formattedMessage, ...args];
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog('debug')) {
      console.log(...this.formatMessage('debug', message, ...args));
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog('info')) {
      console.info(...this.formatMessage('info', message, ...args));
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog('warn')) {
      console.warn(...this.formatMessage('warn', message, ...args));
    }
  }

  error(message: string, ...args: any[]): void {
    if (this.shouldLog('error')) {
      console.error(...this.formatMessage('error', message, ...args));
    }
  }

  // Convenience methods for common patterns
  log(message: string, ...args: any[]): void {
    this.info(message, ...args);
  }

  // Method to create scoped loggers
  scope(prefix: string): Logger {
    return new Logger({
      ...this.config,
      prefix: this.config.prefix ? `${this.config.prefix}:${prefix}` : prefix,
    });
  }

  // Method to temporarily enable/disable logging
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  // Method to change log level
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }
}

// Create default logger instance
const logger = new Logger();

// Export both the class and default instance
export { Logger, logger };
export default logger;
