import compression from 'compression'import compression from 'compression'

import { Request, Response, NextFunction } from 'express'import { Request, Response, NextFunction } from 'express'

import { logger } from '../utils/logger.js'import { logger } from '../utils/logger.js'



/**

 * Simple compression middleware for OAuth responses

 * Optimized for token responses and authentication data/**/**

 */

    * Simple compression middleware for OAuth responses * Simple compression middleware for OAuth responses

interface CompressionOptions {

    threshold ?: number * / */

    level ?: number

    filter ?: (req: Request, res: Response) => boolean

}

/**interface CompressionStats {

export function createCompressionMiddleware(options: CompressionOptions = {}) {

  const compressor = compression({ * Should compress predicate for OAuth responses  requests: number

    threshold: options.threshold || 1024,

    level: options.level || 6, */}

filter: options.filter || defaultFilter

  }) function shouldCompress(req: Request, res: Response): boolean {



    return compressor    // Don't compress if explicitly disabledconst stats: CompressionStats = {

}

if (req.headers['x-no-compression']) {

/**        requests: 0

 * Default filter for OAuth responses

 */        return false

    function defaultFilter(req: Request, res: Response): boolean { }/**

  // Skip if client doesn't want compression

  if (req.headers['x-no-compression']) {  } * Should compress predicate for OAuth responses

    return false

  }   */



    // Skip if already compressed    // Don't compress already compressed responsesfunction shouldCompress(req: Request, res: Response): boolean {

    if (res.getHeader('content-encoding')) {

        return false    if (res.getHeader('content-encoding')) {    // Don't compress if explicitly disabled

        }

        return false    if (req.headers['x-no-compression']) {

            // Compress JSON responses (OAuth tokens, user data)

            const contentType = res.getHeader('content-type') as string
        } return false

        if (contentType?.includes('application/json')) {

            return true
        }

    }

    // Don't compress small responses (< 1KB)

    // Use default compression filter

    return compression.filter(req, res)    const contentLength = res.getHeader('content-length')    // Don't compress already compressed responses

}

if (contentLength && Number(contentLength) < 1024) {

/**        if (res.getHeader('content-encoding')) {

 * OAuth-optimized compression middleware

 */            return false        return false

    export const oauthCompression = compression({

        threshold: 512, // Lower threshold for token responses        }

        level: 6, // Balance between compression ratio and CPU usage    }

        filter: defaultFilter

    })



    /**    // Always compress JSON responses (OAuth typically returns JSON)    // Don't compress small responses (< 1KB)
    
     * Response optimization middleware
    
     * Adds performance headers and applies compression    const contentType = res.getHeader('content-type')    const contentLength = res.getHeader('content-length')
    
     */

    export function responseOptimizationMiddleware(req: Request, res: Response, next: NextFunction) {
        if (contentType && contentType.toString().includes('application/json')) {

            // Add performance headers        if (contentLength && Number(contentLength) < 1024) {

            res.set({

                'X-Content-Type-Options': 'nosniff', return true        return false

    'X-Frame-Options': 'DENY',

                'Cache-Control': 'no-cache, no-store, must-revalidate'
            }

  })
    }



    // Log compression stats

    const originalSend = res.send

    res.send = function (body: unknown) {    // Use default compression filter    // Always compress JSON responses (OAuth typically returns JSON)

        const size = Buffer.byteLength(JSON.stringify(body), 'utf8')

        logger.debug(`Response size: ${size} bytes`)    return compression.filter(req, res)    const contentType = res.getHeader('content-type')

        return originalSend.call(this, body)

    }
} if (contentType && contentType.toString().includes('application/json')) {



    next()    return true

}

/**    }

export default createCompressionMiddleware    
 * Basic compression middleware
 
 */    // Use default compression filter

export const compressionMiddleware = compression({
    return compression.filter(req, res)

  level: 6, // Balance between compression ratio and CPU usage}

    threshold: 1024, // Only compress responses > 1KB

    filter: shouldCompress,/**

}) * Compression middleware with monitoring

 */

/**export const compressionMiddleware = compression({

 * Response optimization middleware  level: 6, // Balance between compression ratio and CPU usage

 * Adds performance headers and optimizations  threshold: 1024, // Only compress responses > 1KB

 */  filter: shouldCompress,

    export function responseOptimizationMiddleware(req: Request, res: Response, next: NextFunction) {})/**

  // Add performance timing header * Enhanced compression with Brotli support

  const startTime = Date.now() * Note: Requires 'compression' package with Brotli support or separate implementation

   */

res.on('finish', () => {
    export function advancedCompressionMiddleware(req: Request, res: Response, next: NextFunction) {

        const responseTime = Date.now() - startTime    const acceptEncoding = req.headers['accept-encoding'] || ''

        res.setHeader('X-Response-Time', `${responseTime}ms`)

        // Track original response size

        // Log slow responses    const originalWrite = res.write

        if (responseTime > 1000) {
            const originalEnd = res.end

            logger.warn('Slow response detected', {
                let responseSize = 0

        path: req.path,

                method: req.method,    // Override write to track size

                responseTime, res.write = function (chunk: unknown) {

                    statusCode: res.statusCode        if (chunk) {

                    })            responseSize += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk.toString())

        }
    }

})        return originalWrite.call(this, chunk)

}

// Security headers for OAuth endpoints

if (req.path.startsWith('/oauth/')) {    // Override end to track final size and log stats

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')    res.end = function (chunk?: unknown) {

        res.setHeader('Pragma', 'no-cache')        if (chunk) {

            res.setHeader('X-Content-Type-Options', 'nosniff')            responseSize += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk.toString())

            res.setHeader('X-Frame-Options', 'DENY')
        }

    }

    // Update compression stats

    // Enable keep-alive for better performance        stats.requests++

    res.setHeader('Connection', 'keep-alive')        stats.bytesIn += responseSize

    res.setHeader('Keep-Alive', 'timeout=5, max=1000')

    const compressedSize = Number(res.getHeader('content-length')) || responseSize

    next()        stats.bytesOut += compressedSize

} stats.compressionRatio = stats.bytesIn > 0 ? (1 - stats.bytesOut / stats.bytesIn) * 100 : 0



/**        // Log significant compressions

 * Middleware for static asset compression        if (responseSize > 5120) { // > 5KB

 */            const ratio = responseSize > 0 ? ((responseSize - compressedSize) / responseSize * 100).toFixed(1) : '0'

export const staticCompressionMiddleware = compression({
    logger.debug('Response compressed', {

        level: 9, // Maximum compression for static assets                path: req.path,

        threshold: 0, // Compress all static assets                originalSize: responseSize,

        filter: (req: Request, _res: Response) => {
            compressedSize,

    // Only for static assets                compressionRatio: `${ratio}%`,

    const path = req.path                encoding: res.getHeader('content-encoding')

            return path.includes('/static/') ||             })

           path.endsWith('.js') ||         }

           path.endsWith('.css') ||

    path.endsWith('.html') ||        return originalEnd.call(this, chunk)

path.endsWith('.svg')    }

  }

})    // Prefer Brotli for modern browsers

if (acceptEncoding.includes('br') && process.env.NODE_ENV === 'production') {

    export default {        // Brotli compression would be implemented here

        compressionMiddleware,        // For now, fall back to gzip

        responseOptimizationMiddleware, compressionMiddleware(req, res, next)

  staticCompressionMiddleware
    } else if (acceptEncoding.includes('gzip')) {

    } compressionMiddleware(req, res, next)
} else {
    next()
}
}

/**
 * Response optimization middleware
 * Adds performance headers and optimizations
 */
export function responseOptimizationMiddleware(req: Request, res: Response, next: NextFunction) {
    // Add performance timing header
    const startTime = Date.now()

    res.on('finish', () => {
        const responseTime = Date.now() - startTime
        res.setHeader('X-Response-Time', `${responseTime}ms`)

        // Log slow responses
        if (responseTime > 1000) {
            logger.warn('Slow response detected', {
                path: req.path,
                method: req.method,
                responseTime,
                statusCode: res.statusCode
            })
        }
    })

    // Security headers for OAuth endpoints
    if (req.path.startsWith('/oauth/')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
        res.setHeader('Pragma', 'no-cache')
        res.setHeader('X-Content-Type-Options', 'nosniff')
        res.setHeader('X-Frame-Options', 'DENY')
    }

    // Enable keep-alive for better performance
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('Keep-Alive', 'timeout=5, max=1000')

    next()
}

/**
 * Get compression statistics
 */
export function getCompressionStats(): CompressionStats {
    return { ...stats }
}

/**
 * Reset compression statistics
 */
export function resetCompressionStats(): void {
    stats.requests = 0
    stats.bytesIn = 0
    stats.bytesOut = 0
    stats.compressionRatio = 0
}

/**
 * Middleware for static asset compression
 */
export const staticCompressionMiddleware = compression({
    level: 9, // Maximum compression for static assets
    threshold: 0, // Compress all static assets
    filter: (req: Request, res: Response) => {
        // Only for static assets
        const path = req.path
        return path.includes('/static/') ||
            path.endsWith('.js') ||
            path.endsWith('.css') ||
            path.endsWith('.html') ||
            path.endsWith('.svg')
    }
})

export default {
    compressionMiddleware,
    advancedCompressionMiddleware,
    responseOptimizationMiddleware,
    staticCompressionMiddleware,
    getCompressionStats,
    resetCompressionStats
}

            return true
        }

    }

    // Don't compress small responses (< 1KB)

    // Use default compression filter

    return compression.filter(req, res)    const contentLength = res.getHeader('content-length')    // Don't compress already compressed responses

}

if (contentLength && Number(contentLength) < 1024) {

/**        if (res.getHeader('content-encoding')) {

 * OAuth-optimized compression middleware

 */            return false        return false

    export const oauthCompression = compression({

        threshold: 512, // Lower threshold for token responses        }

        level: 6, // Balance between compression ratio and CPU usage    }

        filter: defaultFilter

    })



    /**    // Always compress JSON responses (OAuth typically returns JSON)    // Don't compress small responses (< 1KB)
    
     * Response optimization middleware
    
     * Adds performance headers and applies compression    const contentType = res.getHeader('content-type')    const contentLength = res.getHeader('content-length')
    
     */

    export function responseOptimizationMiddleware(req: Request, res: Response, next: NextFunction) {
        if (contentType && contentType.toString().includes('application/json')) {

            // Add performance headers        if (contentLength && Number(contentLength) < 1024) {

            res.set({

                'X-Content-Type-Options': 'nosniff', return true        return false

    'X-Frame-Options': 'DENY',

                'Cache-Control': 'no-cache, no-store, must-revalidate'
            }

  })
    }



    // Log compression stats

    const originalSend = res.send

    res.send = function (body: unknown) {    // Use default compression filter    // Always compress JSON responses (OAuth typically returns JSON)

        const size = Buffer.byteLength(JSON.stringify(body), 'utf8')

        logger.debug(`Response size: ${size} bytes`)    return compression.filter(req, res)    const contentType = res.getHeader('content-type')

        return originalSend.call(this, body)

    }
} if (contentType && contentType.toString().includes('application/json')) {



    next()    return true

}

/**    }

export default createCompressionMiddleware    
 * Basic compression middleware
 
 */    // Use default compression filter

export const compressionMiddleware = compression({
    return compression.filter(req, res)

  level: 6, // Balance between compression ratio and CPU usage}

    threshold: 1024, // Only compress responses > 1KB

    filter: shouldCompress,/**

}) * Compression middleware with monitoring

 */

/**export const compressionMiddleware = compression({

 * Response optimization middleware  level: 6, // Balance between compression ratio and CPU usage

 * Adds performance headers and optimizations  threshold: 1024, // Only compress responses > 1KB

 */  filter: shouldCompress,

    export function responseOptimizationMiddleware(req: Request, res: Response, next: NextFunction) {})/**

  // Add performance timing header * Enhanced compression with Brotli support

  const startTime = Date.now() * Note: Requires 'compression' package with Brotli support or separate implementation

   */

res.on('finish', () => {
    export function advancedCompressionMiddleware(req: Request, res: Response, next: NextFunction) {

        const responseTime = Date.now() - startTime    const acceptEncoding = req.headers['accept-encoding'] || ''

        res.setHeader('X-Response-Time', `${responseTime}ms`)

        // Track original response size

        // Log slow responses    const originalWrite = res.write

        if (responseTime > 1000) {
            const originalEnd = res.end

            logger.warn('Slow response detected', {
                let responseSize = 0

        path: req.path,

                method: req.method,    // Override write to track size

                responseTime, res.write = function (chunk: unknown) {

                    statusCode: res.statusCode        if (chunk) {

                    })            responseSize += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk.toString())

        }
    }

})        return originalWrite.call(this, chunk)

}

// Security headers for OAuth endpoints

if (req.path.startsWith('/oauth/')) {    // Override end to track final size and log stats

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')    res.end = function (chunk?: unknown) {

        res.setHeader('Pragma', 'no-cache')        if (chunk) {

            res.setHeader('X-Content-Type-Options', 'nosniff')            responseSize += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk.toString())

            res.setHeader('X-Frame-Options', 'DENY')
        }

    }

    // Update compression stats

    // Enable keep-alive for better performance        stats.requests++

    res.setHeader('Connection', 'keep-alive')        stats.bytesIn += responseSize

    res.setHeader('Keep-Alive', 'timeout=5, max=1000')

    const compressedSize = Number(res.getHeader('content-length')) || responseSize

    next()        stats.bytesOut += compressedSize

} stats.compressionRatio = stats.bytesIn > 0 ? (1 - stats.bytesOut / stats.bytesIn) * 100 : 0



/**        // Log significant compressions

 * Middleware for static asset compression        if (responseSize > 5120) { // > 5KB

 */            const ratio = responseSize > 0 ? ((responseSize - compressedSize) / responseSize * 100).toFixed(1) : '0'

export const staticCompressionMiddleware = compression({
    logger.debug('Response compressed', {

        level: 9, // Maximum compression for static assets                path: req.path,

        threshold: 0, // Compress all static assets                originalSize: responseSize,

        filter: (req: Request, _res: Response) => {
            compressedSize,

    // Only for static assets                compressionRatio: `${ratio}%`,

    const path = req.path                encoding: res.getHeader('content-encoding')

            return path.includes('/static/') ||             })

           path.endsWith('.js') ||         }

           path.endsWith('.css') ||

    path.endsWith('.html') ||        return originalEnd.call(this, chunk)

path.endsWith('.svg')    }

  }

})    // Prefer Brotli for modern browsers

if (acceptEncoding.includes('br') && process.env.NODE_ENV === 'production') {

    export default {        // Brotli compression would be implemented here

        compressionMiddleware,        // For now, fall back to gzip

        responseOptimizationMiddleware, compressionMiddleware(req, res, next)

  staticCompressionMiddleware
    } else if (acceptEncoding.includes('gzip')) {

    } compressionMiddleware(req, res, next)
} else {
    next()
}
}

/**
 * Response optimization middleware
 * Adds performance headers and optimizations
 */
export function responseOptimizationMiddleware(req: Request, res: Response, next: NextFunction) {
    // Add performance timing header
    const startTime = Date.now()

    res.on('finish', () => {
        const responseTime = Date.now() - startTime
        res.setHeader('X-Response-Time', `${responseTime}ms`)

        // Log slow responses
        if (responseTime > 1000) {
            logger.warn('Slow response detected', {
                path: req.path,
                method: req.method,
                responseTime,
                statusCode: res.statusCode
            })
        }
    })

    // Security headers for OAuth endpoints
    if (req.path.startsWith('/oauth/')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
        res.setHeader('Pragma', 'no-cache')
        res.setHeader('X-Content-Type-Options', 'nosniff')
        res.setHeader('X-Frame-Options', 'DENY')
    }

    // Enable keep-alive for better performance
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('Keep-Alive', 'timeout=5, max=1000')

    next()
}

/**
 * Get compression statistics
 */
export function getCompressionStats(): CompressionStats {
    return { ...stats }
}

/**
 * Reset compression statistics
 */
export function resetCompressionStats(): void {
    stats.requests = 0
    stats.bytesIn = 0
    stats.bytesOut = 0
    stats.compressionRatio = 0
}

/**
 * Middleware for static asset compression
 */
export const staticCompressionMiddleware = compression({
    level: 9, // Maximum compression for static assets
    threshold: 0, // Compress all static assets
    filter: (req: Request, res: Response) => {
        // Only for static assets
        const path = req.path
        return path.includes('/static/') ||
            path.endsWith('.js') ||
            path.endsWith('.css') ||
            path.endsWith('.html') ||
            path.endsWith('.svg')
    }
})

export default {
    compressionMiddleware,
    advancedCompressionMiddleware,
    responseOptimizationMiddleware,
    staticCompressionMiddleware,
    getCompressionStats,
    resetCompressionStats
}
