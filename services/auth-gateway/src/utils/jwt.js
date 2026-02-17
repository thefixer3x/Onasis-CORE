import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
/**
 * Generate access and refresh tokens for a user
 */
export function generateTokenPair(payload) {
    const secret = env.JWT_SECRET
    const accessOptions = { expiresIn: env.JWT_EXPIRY };
    const refreshOptions = { expiresIn: '30d' };
    const accessToken = jwt.sign(payload, secret, accessOptions);
    const refreshToken = jwt.sign({ sub: payload.sub, type: 'refresh' }, secret, refreshOptions);
    // Calculate expiry in seconds
    const expiresIn = env.JWT_EXPIRY.endsWith('d')
        ? Number.parseInt(env.JWT_EXPIRY.slice(0, -1)) * 86400
        : Number.parseInt(env.JWT_EXPIRY.slice(0, -1)) * 3600;
    return {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: expiresIn,
    };
}
/**
 * Verify and decode a JWT token
 */
export function verifyToken(token) {
    try {
        return jwt.verify(token, env.JWT_SECRET
    }
    catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            throw new Error('Token expired');
        }
        if (error instanceof jwt.JsonWebTokenError) {
            throw new Error('Invalid token');
        }
        throw new Error('Token verification failed');
    }
}
/**
 * Decode token without verification (for inspection only)
 */
export function decodeToken(token) {
    try {
        return jwt.decode(token);
    }
    catch {
        return null;
    }
}
/**
 * Extract token from Authorization header
 */
export function extractBearerToken(authHeader) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }
    return authHeader.slice(7);
}
