/**
 * Logger Utility
 * Simple colored console logging
 */

export enum LogLevel {
  INFO = 'INFO',
  SUCCESS = 'SUCCESS',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  DEBUG = 'DEBUG',
}

const colors = {
  reset: '\x1b[0m',
  info: '\x1b[36m', // Cyan
  success: '\x1b[32m', // Green
  warning: '\x1b[33m', // Yellow
  error: '\x1b[31m', // Red
  debug: '\x1b[90m', // Gray
};

class Logger {
  private prefix: string;

  constructor(prefix: string = '') {
    this.prefix = prefix;
  }

  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString();
    const prefixStr = this.prefix ? `[${this.prefix}] ` : '';
    return `${timestamp} ${prefixStr}[${level}] ${message}`;
  }

  private getColor(level: LogLevel): string {
    switch (level) {
      case LogLevel.INFO:
        return colors.info;
      case LogLevel.SUCCESS:
        return colors.success;
      case LogLevel.WARNING:
        return colors.warning;
      case LogLevel.ERROR:
        return colors.error;
      case LogLevel.DEBUG:
        return colors.debug;
      default:
        return colors.reset;
    }
  }

  private log(level: LogLevel, message: string, data?: any) {
    const color = this.getColor(level);
    const formattedMessage = this.formatMessage(level, message);
    console.log(`${color}${formattedMessage}${colors.reset}`);

    if (data !== undefined) {
      console.log(data);
    }
  }

  info(message: string, data?: any) {
    this.log(LogLevel.INFO, message, data);
  }

  success(message: string, data?: any) {
    this.log(LogLevel.SUCCESS, message, data);
  }

  warning(message: string, data?: any) {
    this.log(LogLevel.WARNING, message, data);
  }

  error(message: string, error?: any) {
    this.log(LogLevel.ERROR, message);
    if (error) {
      console.error(error);
    }
  }

  debug(message: string, data?: any) {
    if (process.env.NODE_ENV === 'development') {
      this.log(LogLevel.DEBUG, message, data);
    }
  }
}

export function createLogger(prefix: string = ''): Logger {
  return new Logger(prefix);
}

export const logger = new Logger();
