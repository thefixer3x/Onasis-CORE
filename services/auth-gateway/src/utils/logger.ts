/**
 * Simple logger utility for the auth gateway
 * Provides consistent logging interface
 */

export interface Logger {
    debug(message: string, meta?: unknown): void
    info(message: string, meta?: unknown): void
    warn(message: string, meta?: unknown): void
    error(message: string, meta?: unknown): void
}

class SimpleLogger implements Logger {
    debug(message: string, meta?: unknown): void {
        if (process.env.NODE_ENV === 'development') {
            console.log(`[DEBUG] ${message}`, meta ? JSON.stringify(meta, null, 2) : '')
        }
    }

    info(message: string, meta?: unknown): void {
        console.log(`[INFO] ${message}`, meta ? JSON.stringify(meta, null, 2) : '')
    }

    warn(message: string, meta?: unknown): void {
        console.warn(`[WARN] ${message}`, meta ? JSON.stringify(meta, null, 2) : '')
    }

    error(message: string, meta?: unknown): void {
        console.error(`[ERROR] ${message}`, meta ? JSON.stringify(meta, null, 2) : '')
    }
}

export const logger = new SimpleLogger()