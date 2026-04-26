/**
 * Pluggable logger. Default sink is `console`; swap in a buffered or
 * file-backed sink for tests or recording.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

export interface LoggerSink {
  write(level: LogLevel, args: unknown[]): void
}

export class ConsoleLoggerSink implements LoggerSink {
  write(level: LogLevel, args: unknown[]): void {
    const prefix = `[${level}]`
    if (level === 'error') console.error(prefix, ...args)
    else if (level === 'warn') console.warn(prefix, ...args)
    else if (level === 'debug') console.debug(prefix, ...args)
    else console.log(prefix, ...args)
  }
}

export class Logger {
  private sink: LoggerSink
  private minLevel: LogLevel

  constructor(sink: LoggerSink = new ConsoleLoggerSink(), minLevel: LogLevel = 'info') {
    this.sink = sink
    this.minLevel = minLevel
  }

  setLevel(level: LogLevel): void {
    this.minLevel = level
  }

  setSink(sink: LoggerSink): void {
    this.sink = sink
  }

  debug(...args: unknown[]): void {
    this.log('debug', args)
  }

  info(...args: unknown[]): void {
    this.log('info', args)
  }

  warn(...args: unknown[]): void {
    this.log('warn', args)
  }

  error(...args: unknown[]): void {
    this.log('error', args)
  }

  private log(level: LogLevel, args: unknown[]): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return
    this.sink.write(level, args)
  }
}
