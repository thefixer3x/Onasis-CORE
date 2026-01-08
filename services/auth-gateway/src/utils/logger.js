/**
 * Simple logger utility for the auth gateway
 * Provides consistent logging interface
 */
class SimpleLogger {
    debug(message, meta) {
        if (process.env.NODE_ENV === 'development') {
            console.log(`[DEBUG] ${message}`, meta ? JSON.stringify(meta, null, 2) : '');
        }
    }
    info(message, meta) {
        console.log(`[INFO] ${message}`, meta ? JSON.stringify(meta, null, 2) : '');
    }
    warn(message, meta) {
        console.warn(`[WARN] ${message}`, meta ? JSON.stringify(meta, null, 2) : '');
    }
    error(message, meta) {
        console.error(`[ERROR] ${message}`, meta ? JSON.stringify(meta, null, 2) : '');
    }
}
export const logger = new SimpleLogger();
