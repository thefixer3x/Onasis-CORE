import crypto from 'node:crypto';
import { z } from 'zod';
export const codeVerifierSchema = z
    .string()
    .min(43, 'code_verifier must be at least 43 characters')
    .max(128, 'code_verifier must be at most 128 characters')
    .regex(/^[A-Za-z0-9\-._~]+$/, 'code_verifier contains invalid characters');
export function deriveCodeChallenge(verifier, method) {
    if (method === 'plain') {
        return verifier;
    }
    const digest = crypto.createHash('sha256').update(verifier).digest();
    return bufferToBase64Url(digest);
}
export function verifyCodeChallenge(verifier, expectedChallenge, method) {
    const derived = deriveCodeChallenge(verifier, method);
    // Perform constant-time comparison while avoiding length-based early exit.
    // Pad both buffers to the same length, then ensure original lengths match.
    const derivedBuf = Buffer.from(derived);
    const expectedBuf = Buffer.from(expectedChallenge);
    const maxLen = Math.max(derivedBuf.length, expectedBuf.length);
    const paddedDerived = Buffer.alloc(maxLen);
    const paddedExpected = Buffer.alloc(maxLen);
    derivedBuf.copy(paddedDerived);
    expectedBuf.copy(paddedExpected);
    const isEqual = crypto.timingSafeEqual(paddedDerived, paddedExpected);
    return isEqual && derivedBuf.length === expectedBuf.length;
}
export function hashAuthorizationCode(code) {
    return crypto.createHash('sha256').update(code).digest('hex');
}
export function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}
export function generateOpaqueToken(byteLength = 48) {
    const random = crypto.randomBytes(byteLength);
    return bufferToBase64Url(random);
}
function bufferToBase64Url(buffer) {
    return buffer
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}
