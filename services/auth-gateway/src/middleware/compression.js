/**
 * OAuth2-optimized compression middleware
 * Handles response compression with performance monitoring and OAuth-specific optimizations
 */
import zlib from 'zlib';
// Simple logger for compression middleware
const logger = {
    debug: (message, ...args) => console.log(`[DEBUG] ${message}`, ...args),
    info: (message, ...args) => console.log(`[INFO] ${message}`, ...args),
    warn: (message, ...args) => console.warn(`[WARN] ${message}`, ...args),
    error: (message, ...args) => console.error(`[ERROR] ${message}`, ...args)
};
export class CompressionMiddleware {
    options;
    stats = new Map();
    constructor(options = {}) {
        this.options = {
            threshold: options.threshold || 1024, // 1KB minimum
            level: options.level || 6, // Balanced compression
            filter: options.filter || this.defaultFilter
        };
    }
    /**
     * Default filter for compressible content
     */
    defaultFilter(_req, res) {
        const contentType = res.get('Content-Type') || '';
        // Compress JSON responses (OAuth tokens, user data)
        if (contentType.includes('application/json'))
            return true;
        // Compress HTML/JS/CSS for auth pages
        if (contentType.includes('text/html'))
            return true;
        if (contentType.includes('application/javascript'))
            return true;
        if (contentType.includes('text/css'))
            return true;
        // Skip already compressed content
        if (contentType.includes('image/') ||
            contentType.includes('video/') ||
            contentType.includes('application/zip')) {
            return false;
        }
        return true;
    }
    /**
     * Create Express middleware
     */
    middleware() {
        return (req, res, next) => {
            // Skip if client doesn't accept compression
            const acceptEncoding = req.get('Accept-Encoding') || '';
            if (!acceptEncoding.includes('gzip') && !acceptEncoding.includes('deflate')) {
                return next();
            }
            // Override res.json for OAuth token responses
            const originalJson = res.json;
            res.json = (body) => {
                if (this.options.filter(req, res) && this.shouldCompress(body)) {
                    return this.compressResponse(res, originalJson, body, 'application/json');
                }
                return originalJson.call(res, body);
            };
            // Override res.send for general responses
            const originalSend = res.send;
            res.send = (body) => {
                if (this.options.filter(req, res) && this.shouldCompress(body)) {
                    return this.compressResponse(res, originalSend, body);
                }
                return originalSend.call(res, body);
            };
            next();
        };
    }
    /**
     * Check if content should be compressed
     */
    shouldCompress(body) {
        if (!body)
            return false;
        const size = typeof body === 'string' ?
            Buffer.byteLength(body, 'utf8') :
            Buffer.byteLength(JSON.stringify(body), 'utf8');
        return size >= this.options.threshold;
    }
    /**
     * Compress and send response
     */
    compressResponse(res, originalMethod, body, contentType) {
        try {
            const data = typeof body === 'string' ? body : JSON.stringify(body);
            const buffer = Buffer.from(data, 'utf8');
            // Use gzip compression
            const compressed = zlib.gzipSync(buffer, { level: this.options.level });
            // Set compression headers
            res.set({
                'Content-Encoding': 'gzip',
                'Content-Length': compressed.length.toString(),
                'Vary': 'Accept-Encoding'
            });
            if (contentType) {
                res.set('Content-Type', contentType);
            }
            // Log compression stats for monitoring
            this.logCompressionStats(buffer.length, compressed.length, 'gzip');
            return res.end(compressed);
        }
        catch (error) {
            logger.warn('Compression failed, sending uncompressed:', error);
            return originalMethod.call(res, body);
        }
    }
    /**
     * Log compression statistics
     */
    logCompressionStats(originalSize, compressedSize, method) {
        const compressionRatio = ((originalSize - compressedSize) / originalSize) * 100;
        const stats = {
            originalSize,
            compressedSize,
            compressionRatio,
            method
        };
        // Store stats for monitoring
        const timestamp = new Date().toISOString();
        this.stats.set(timestamp, stats);
        // Clean old stats (keep last 100)
        if (this.stats.size > 100) {
            const oldestKey = this.stats.keys().next().value;
            if (oldestKey)
                this.stats.delete(oldestKey);
        }
        logger.debug(`Compression: ${originalSize}B → ${compressedSize}B (${compressionRatio.toFixed(1)}% reduction)`);
    }
    /**
     * Get compression statistics
     */
    getStats() {
        return Array.from(this.stats.values());
    }
    /**
     * Clear statistics
     */
    clearStats() {
        this.stats.clear();
    }
}
/**
 * Create OAuth-optimized compression middleware
 */
export function createCompressionMiddleware(options) {
    const compression = new CompressionMiddleware(options);
    return compression.middleware();
}
/**
 * Express middleware for OAuth token response compression
 */
export function oauthCompressionMiddleware(req, res, next) {
    const compression = new CompressionMiddleware({
        threshold: 512, // Lower threshold for token responses
        level: 9, // Maximum compression for sensitive data
        filter: (req, res) => {
            // Only compress OAuth-related endpoints
            const path = req.path;
            return path.includes('/oauth/') ||
                path.includes('/auth/') ||
                path.includes('/token') ||
                res.get('Content-Type')?.includes('application/json') === true;
        }
    });
    return compression.middleware()(req, res, next);
}
export default CompressionMiddleware;
