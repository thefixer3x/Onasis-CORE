import { env } from '../config/env.js'

type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace'

const levelPriority: Record<LogLevel, number> = {
  fatal: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5,
}

const currentLevel = env.LOG_LEVEL

function shouldLog(level: LogLevel): boolean {
  return levelPriority[level] <= levelPriority[currentLevel]
}

function format(level: LogLevel, message: string, metadata?: Record<string, unknown>) {
  const payload = {
    level,
    timestamp: new Date().toISOString(),
    message,
    ...metadata,
  }
  return env.NODE_ENV === 'development' ? payload : JSON.stringify(payload)
}

export const logger = {
  fatal: (message: string, metadata?: Record<string, unknown>) => {
    if (shouldLog('fatal')) console.error(format('fatal', message, metadata))
  },
  error: (message: string, metadata?: Record<string, unknown>) => {
    if (shouldLog('error')) console.error(format('error', message, metadata))
  },
  warn: (message: string, metadata?: Record<string, unknown>) => {
    if (shouldLog('warn')) console.warn(format('warn', message, metadata))
  },
  info: (message: string, metadata?: Record<string, unknown>) => {
    if (shouldLog('info')) console.log(format('info', message, metadata))
  },
  debug: (message: string, metadata?: Record<string, unknown>) => {
    if (shouldLog('debug')) console.log(format('debug', message, metadata))
  },
  trace: (message: string, metadata?: Record<string, unknown>) => {
    if (shouldLog('trace')) console.log(format('trace', message, metadata))
  },
}
