import { env } from '../config/env.js';
const levelPriority = {
    fatal: 0,
    error: 1,
    warn: 2,
    info: 3,
    debug: 4,
    trace: 5,
};
const currentLevel = env.LOG_LEVEL;
function shouldLog(level) {
    return levelPriority[level] <= levelPriority[currentLevel];
}
function format(level, message, metadata) {
    const payload = {
        level,
        timestamp: new Date().toISOString(),
        message,
        ...metadata,
    };
    return env.NODE_ENV === 'development' ? payload : JSON.stringify(payload);
}
export const logger = {
    fatal: (message, metadata) => {
        if (shouldLog('fatal'))
            console.error(format('fatal', message, metadata));
    },
    error: (message, metadata) => {
        if (shouldLog('error'))
            console.error(format('error', message, metadata));
    },
    warn: (message, metadata) => {
        if (shouldLog('warn'))
            console.warn(format('warn', message, metadata));
    },
    info: (message, metadata) => {
        if (shouldLog('info'))
            console.log(format('info', message, metadata));
    },
    debug: (message, metadata) => {
        if (shouldLog('debug'))
            console.log(format('debug', message, metadata));
    },
    trace: (message, metadata) => {
        if (shouldLog('trace'))
            console.log(format('trace', message, metadata));
    },
};
