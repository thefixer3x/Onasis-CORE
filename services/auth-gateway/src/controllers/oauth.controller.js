import { z } from 'zod';
import { logger } from '../utils/logger.js';
import { OAuthServiceError, createAuthorizationCode, consumeAuthorizationCode, findRefreshToken, introspectToken, isChallengeMethodAllowed, isRedirectUriAllowed, issueTokenPair, logOAuthEvent, revokeTokenByValue, resolveScopes, rotateRefreshToken, getClient, } from '../services/oauth.service.js';
import { codeVerifierSchema, verifyCodeChallenge, } from '../utils/pkce.js';
const authorizeRequestSchema = z.object({
    response_type: z.literal('code'),
    client_id: z.string().min(1),
    redirect_uri: z.string().url(),
    scope: z.string().optional(),
    state: z.string().optional(),
    code_challenge: z.string().min(43).max(256),
    code_challenge_method: z.enum(['S256', 'plain']).default('S256'),
});
const tokenRequestSchema = z.discriminatedUnion('grant_type', [
    z.object({
        grant_type: z.literal('authorization_code'),
        code: z.string().min(1),
        // Per RFC 6749 §4.1.3, redirect_uri MUST be included if it was included in the authorization request
        redirect_uri: z.string().url(),
        client_id: z.string().min(1),
        code_verifier: codeVerifierSchema,
    }),
    z.object({
        grant_type: z.literal('refresh_token'),
        refresh_token: z.string().min(1),
        client_id: z.string().min(1),
        scope: z.string().optional(),
    }),
]);
const revokeRequestSchema = z.object({
    token: z.string().min(1),
    token_type_hint: z.enum(['access_token', 'refresh_token']).optional(),
});
const introspectSchema = z.object({
    token: z.string().min(1),
});
function parseScope(scope) {
    if (!scope) {
        return undefined;
    }
    return scope
        .split(' ')
        .map((value) => value.trim())
        .filter(Boolean);
}
function sendOAuthError(res, error) {
    if (error instanceof OAuthServiceError) {
        return res.status(error.statusCode).json({
            error: error.oauthError,
            error_description: error.message,
        });
    }
    console.error('Unhandled OAuth error', error);
    return res.status(500).json({
        error: 'server_error',
        error_description: 'Internal server error',
    });
}
export async function authorize(req, res) {
    const parseResult = authorizeRequestSchema.safeParse(req.query);
    if (!parseResult.success) {
        return res.status(400).json({
            error: 'invalid_request',
            error_description: 'Invalid authorization request parameters',
            details: parseResult.error.flatten().fieldErrors,
        });
    }
    const payload = parseResult.data;
    const userId = req.user?.sub;
    if (!userId) {
        // Redirect to login page with return URL
        // Use CLI login form for CLI clients, web login for others
        const returnUrl = req.originalUrl;
        const isCLIClient = payload.client_id === 'lanonasis-cli' || payload.client_id?.includes('cli');
        const loginPath = isCLIClient ? '/auth/cli-login' : '/web/login';
        return res.redirect(`${loginPath}?return_to=${encodeURIComponent(returnUrl)}`);
    }
    try {
        let client = await getClient(payload.client_id);
        // Auto-register unknown MCP clients with localhost redirects for seamless plug-and-play
        if (!client && payload.redirect_uri) {
            const isLocalhost = payload.redirect_uri.startsWith('http://localhost') ||
                payload.redirect_uri.startsWith('http://127.0.0.1') ||
                payload.redirect_uri.startsWith('http://[::1]');
            if (isLocalhost) {
                const { dbPool } = await import('../../db/client.js');
                await dbPool.query(`
                    INSERT INTO auth_gateway.oauth_clients (
                        client_id, client_name, client_type, require_pkce,
                        allowed_code_challenge_methods, allowed_redirect_uris,
                        allowed_scopes, default_scopes, status, description
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    ON CONFLICT (client_id) DO NOTHING
                `, [
                    payload.client_id,
                    'MCP Client (auto-registered)',
                    'public',
                    true,
                    ['S256', 'plain'],
                    JSON.stringify([payload.redirect_uri]),
                    ['memories:read', 'memories:write', 'mcp:connect', 'mcp:full', 'api:access'],
                    ['memories:read', 'mcp:connect'],
                    'active',
                    'Auto-registered MCP client at /oauth/authorize (localhost redirect)'
                ]);
                logger.info(`Auto-registered MCP client: ${payload.client_id}`);
                client = await getClient(payload.client_id);
            }
        }
        if (!client) {
            throw new OAuthServiceError('Unknown client_id', 'invalid_client', 400);
        }
        // For auto-registered clients, also check if their redirect URI needs updating
        if (!isRedirectUriAllowed(client, payload.redirect_uri)) {
            // If localhost redirect, auto-add it to allowed URIs
            const isLocalhostRedirect = payload.redirect_uri.startsWith('http://localhost') ||
                payload.redirect_uri.startsWith('http://127.0.0.1') ||
                payload.redirect_uri.startsWith('http://[::1]');
            if (isLocalhostRedirect) {
                const { dbPool } = await import('../../db/client.js');
                const currentUris = Array.isArray(client.allowed_redirect_uris)
                    ? client.allowed_redirect_uris
                    : JSON.parse(String(client.allowed_redirect_uris || '[]'));
                currentUris.push(payload.redirect_uri);
                await dbPool.query(`
                    UPDATE auth_gateway.oauth_clients
                    SET allowed_redirect_uris = $1, updated_at = NOW()
                    WHERE client_id = $2
                `, [JSON.stringify([...new Set(currentUris)]), payload.client_id]);
                logger.info(`Added redirect URI to MCP client: ${payload.client_id} -> ${payload.redirect_uri}`);
                // Refresh client - keep existing if refresh fails
                const refreshedClient = await getClient(payload.client_id);
                if (refreshedClient) {
                    client = refreshedClient;
                }
            }
        }
        if (!isRedirectUriAllowed(client, payload.redirect_uri)) {
            throw new OAuthServiceError('Redirect URI not allowed for client', 'invalid_request', 400);
        }
        const method = payload.code_challenge_method;
        if (!isChallengeMethodAllowed(client, method)) {
            throw new OAuthServiceError('Unsupported code challenge method', 'invalid_request', 400);
        }
        const scopes = resolveScopes(client, parseScope(payload.scope));
        const result = await createAuthorizationCode({
            client,
            userId,
            redirectUri: payload.redirect_uri,
            scope: scopes,
            state: payload.state,
            codeChallenge: payload.code_challenge,
            codeChallengeMethod: method,
            ipAddress: req.ip,
            userAgent: req.get('user-agent') || undefined,
        });
        await logOAuthEvent({
            event_type: 'authorize_request',
            client_id: client.client_id,
            user_id: userId,
            scope: scopes,
            redirect_uri: payload.redirect_uri,
            ip_address: req.ip,
            user_agent: req.get('user-agent') || undefined,
            success: true,
        });
        const redirectUrl = new URL(payload.redirect_uri);
        redirectUrl.searchParams.set('code', result.authorizationCode);
        if (payload.state) {
            redirectUrl.searchParams.set('state', payload.state);
        }
        logger.info('OAuth authorize success, redirecting to callback', {
            client_id: client.client_id,
            redirect_uri: redirectUrl.toString(),
            has_code: !!result.authorizationCode,
            has_state: !!payload.state,
            user_id: userId
        });
        return res.redirect(302, redirectUrl.toString());
    }
    catch (error) {
        await logOAuthEvent({
            event_type: 'authorize_request',
            client_id: payload.client_id,
            user_id: userId,
            scope: parseScope(payload.scope),
            redirect_uri: payload.redirect_uri,
            ip_address: req.ip,
            user_agent: req.get('user-agent') || undefined,
            success: false,
            error_code: error instanceof OAuthServiceError ? error.oauthError : 'server_error',
            error_description: error instanceof Error ? error.message : 'Unknown error',
        });
        return sendOAuthError(res, error);
    }
}
export async function token(req, res) {
    const parseResult = tokenRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
        return res.status(400).json({
            error: 'invalid_request',
            error_description: 'Invalid token request parameters',
            details: parseResult.error.flatten().fieldErrors,
        });
    }
    const payload = parseResult.data;
    try {
        const client = await getClient(payload.client_id);
        if (!client) {
            throw new OAuthServiceError('Unknown client_id', 'invalid_client', 400);
        }
        if (payload.grant_type === 'authorization_code') {
            const authorizationCode = await consumeAuthorizationCode({
                client,
                code: payload.code,
                redirectUri: payload.redirect_uri,
            });
            if (!verifyCodeChallenge(payload.code_verifier, authorizationCode.code_challenge, authorizationCode.code_challenge_method)) {
                throw new OAuthServiceError('Invalid code_verifier', 'invalid_grant', 400);
            }
            const tokenPair = await issueTokenPair({
                client,
                userId: authorizationCode.user_id,
                scope: authorizationCode.scope ?? [],
                ipAddress: req.ip,
                userAgent: req.get('user-agent') || undefined,
            });
            await logOAuthEvent({
                event_type: 'token_issued',
                client_id: client.client_id,
                user_id: authorizationCode.user_id,
                scope: authorizationCode.scope ?? undefined,
                grant_type: 'authorization_code',
                ip_address: req.ip,
                user_agent: req.get('user-agent') || undefined,
                success: true,
            });
            return res.json({
                token_type: 'Bearer',
                access_token: tokenPair.accessToken.value,
                expires_in: tokenPair.accessTokenExpiresIn,
                refresh_token: tokenPair.refreshToken.value,
                refresh_expires_in: tokenPair.refreshTokenExpiresIn,
                scope: (authorizationCode.scope ?? []).join(' '),
            });
        }
        if (payload.grant_type === 'refresh_token') {
            const existingToken = await findRefreshToken(payload.refresh_token, client.client_id);
            if (!existingToken) {
                throw new OAuthServiceError('Refresh token invalid or expired', 'invalid_grant', 400);
            }
            const requestedScopes = parseScope(payload.scope);
            let scopes = existingToken.scope ?? [];
            if (requestedScopes) {
                const sanitized = resolveScopes(client, requestedScopes);
                // Ensure requested scopes are a subset of the original grant
                const exceeding = sanitized.filter((scope) => !scopes.includes(scope));
                if (exceeding.length > 0) {
                    throw new OAuthServiceError('Requested scope exceeds original grant', 'invalid_scope', 400);
                }
                scopes = sanitized;
            }
            const rotated = await rotateRefreshToken({
                existingToken,
                client,
                scope: scopes,
                ipAddress: req.ip,
                userAgent: req.get('user-agent') || undefined,
            });
            await logOAuthEvent({
                event_type: 'token_refreshed',
                client_id: client.client_id,
                user_id: existingToken.user_id,
                scope: scopes,
                grant_type: 'refresh_token',
                ip_address: req.ip,
                user_agent: req.get('user-agent') || undefined,
                success: true,
            });
            return res.json({
                token_type: 'Bearer',
                access_token: rotated.accessToken.value,
                expires_in: rotated.accessTokenExpiresIn,
                refresh_token: rotated.refreshToken.value,
                refresh_expires_in: rotated.refreshTokenExpiresIn,
                scope: scopes.join(' '),
            });
        }
        throw new OAuthServiceError('Unsupported grant_type', 'unsupported_grant_type', 400);
    }
    catch (error) {
        await logOAuthEvent({
            event_type: 'token_error',
            client_id: payload.client_id,
            scope: payload.grant_type === 'refresh_token' ? parseScope(payload.scope) : undefined,
            grant_type: payload.grant_type,
            ip_address: req.ip,
            user_agent: req.get('user-agent') || undefined,
            success: false,
            error_code: error instanceof OAuthServiceError ? error.oauthError : 'server_error',
            error_description: error instanceof Error ? error.message : 'Unknown error',
        });
        return sendOAuthError(res, error);
    }
}
export async function revoke(req, res) {
    const parseResult = revokeRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
        return res.status(400).json({
            error: 'invalid_request',
            error_description: 'Invalid revoke request parameters',
            details: parseResult.error.flatten().fieldErrors,
        });
    }
    const payload = parseResult.data;
    try {
        const outcome = await revokeTokenByValue(payload.token, payload.token_type_hint);
        await logOAuthEvent({
            event_type: 'token_revoked',
            client_id: outcome.clientId,
            user_id: outcome.userId,
            success: outcome.revoked,
            error_code: outcome.revoked ? undefined : 'invalid_token',
            error_description: outcome.revoked ? undefined : 'Token not found',
            ip_address: req.ip,
            user_agent: req.get('user-agent') || undefined,
            metadata: outcome.tokenType ? { token_type: outcome.tokenType } : undefined,
        });
        return res.status(200).json({ revoked: outcome.revoked });
    }
    catch (error) {
        await logOAuthEvent({
            event_type: 'token_revoked',
            success: false,
            error_code: error instanceof OAuthServiceError ? error.oauthError : 'server_error',
            error_description: error instanceof Error ? error.message : 'Unknown error',
            ip_address: req.ip,
            user_agent: req.get('user-agent') || undefined,
        });
        return sendOAuthError(res, error);
    }
}
export async function introspect(req, res) {
    const parseResult = introspectSchema.safeParse(req.body);
    if (!parseResult.success) {
        return res.status(400).json({
            error: 'invalid_request',
            error_description: 'Invalid introspection request parameters',
            details: parseResult.error.flatten().fieldErrors,
        });
    }
    try {
        const data = await introspectToken(parseResult.data.token);
        return res.json(data);
    }
    catch (error) {
        await logOAuthEvent({
            event_type: 'token_introspection_error',
            success: false,
            error_code: error instanceof OAuthServiceError ? error.oauthError : 'server_error',
            error_description: error instanceof Error ? error.message : 'Unknown error',
            ip_address: req.ip,
            user_agent: req.get('user-agent') || undefined,
        });
        // RFC 7662 dictates returning { active: false } on error
        return res.json({ active: false });
    }
}
