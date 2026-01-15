import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import { createRateLimit, clearStore } from '../../src/middleware/rate-limit.js'

// Helper to create a fresh app with rate limiting for each test
function createTestApp(maxRequests = 3, windowMs = 1000) {
    const app = express()
    const rateLimiter = createRateLimit({
        windowMs,
        maxRequests,
        message: 'Rate limit exceeded',
        skipInTest: false
    })
    app.get('/test', rateLimiter, (req, res) => {
        res.json({ success: true })
    })
    return app
}

describe('Rate Limiting Middleware', () => {
    beforeEach(() => {
        clearStore()
    })

    it('should allow requests within limit', async () => {
        const app = createTestApp()
        
        for (let i = 0; i < 3; i++) {
            const response = await request(app)
                .get('/test')
                .expect(200)

            expect(response.headers['x-ratelimit-limit']).toBe('3')
            expect(response.headers['x-ratelimit-remaining']).toBe(String(2 - i))
        }
    })

    it('should reject requests over limit', async () => {
        const app = createTestApp()
        
        // First 3 requests should succeed
        for (let i = 0; i < 3; i++) {
            await request(app).get('/test').expect(200)
        }

        // 4th request should be rate limited
        const response = await request(app)
            .get('/test')
            .expect(429)

        expect(response.body.error).toBe('rate_limit_exceeded')
        expect(response.headers['x-ratelimit-remaining']).toBe('0')
        expect(response.headers['retry-after']).toBeDefined()
    })

    it('should reset counter after window expires', async () => {
        const app = createTestApp(3, 500) // 500ms window for faster test
        
        // Fill up the rate limit
        for (let i = 0; i < 3; i++) {
            await request(app).get('/test').expect(200)
        }

        // Should be rate limited
        await request(app).get('/test').expect(429)

        // Wait for window to reset
        await new Promise(resolve => setTimeout(resolve, 600))

        // Should work again
        await request(app).get('/test').expect(200)
    }, 5000)

    it('should handle concurrent requests correctly', async () => {
        const app = createTestApp()
        
        // Create multiple concurrent requests
        const requests = Array(5).fill(null).map(() =>
            request(app).get('/test')
        )

        const responses = await Promise.all(requests)

        // First 3 should succeed, last 2 should fail
        const successes = responses.filter(r => r.status === 200)
        const failures = responses.filter(r => r.status === 429)

        expect(successes).toHaveLength(3)
        expect(failures).toHaveLength(2)
    })
})
