import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { JWTPayload } from '../types/auth.js';

// Unified user type that works with both JWT and Supabase auth
export interface UnifiedUser extends JWTPayload {
  id?: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}

const supabaseUrl = env.SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

const securitySupabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey).schema('security_service')
  : null;

interface InternalApiKeyRow {
  id: string;
  name: string;
  key_hash: string;
  organization_id: string;
  user_id: string;
  permissions?: string[];
  expires_at?: string | null;
  is_active: boolean;
}

function verifyPbkdf2Hash(value: string, stored: string): boolean {
  const [salt, originalHash] = stored.split(':');
  if (!salt || !originalHash) return false;

  const hash = crypto.pbkdf2Sync(value, salt, 100000, 64, 'sha512').toString('hex');
  return hash === originalHash;
}

async function validateInternalApiKey(apiKey: string): Promise<UnifiedUser | null> {
  if (!securitySupabase) {
    logger.error('Supabase credentials not configured for internal API key validation');
    return null;
  }

  if (!apiKey || typeof apiKey !== 'string') {
    return null;
  }

  try {
    const { data: apiKeys, error } = await securitySupabase
      .from('api_keys')
      .select('*')
      .eq('is_active', true);

    if (error) {
      logger.error('Internal API key lookup failed', { error: error.message });
      return null;
    }

    if (!apiKeys || apiKeys.length === 0) {
      return null;
    }

    const now = new Date();

    for (const keyRecord of apiKeys as InternalApiKeyRow[]) {
      if (!keyRecord.key_hash || typeof keyRecord.key_hash !== 'string') continue;

      const match = verifyPbkdf2Hash(apiKey, keyRecord.key_hash);
      if (!match) continue;

      if (keyRecord.expires_at) {
        const expiresAt = new Date(keyRecord.expires_at);
        if (expiresAt < now) {
          logger.warn('Internal API key expired', { keyId: keyRecord.id, userId: keyRecord.user_id });
          return null;
        }
      }

      const { data: user, error: userError } = await securitySupabase
        .from('users')
        .select('*')
        .eq('id', keyRecord.user_id)
        .single();

      if (userError || !user) {
        logger.warn('User not found for internal API key', {
          keyId: keyRecord.id,
          userId: keyRecord.user_id,
          error: userError?.message,
        });
        return null;
      }

      await securitySupabase
        .from('api_keys')
        .update({ last_used: now.toISOString() })
        .eq('id', keyRecord.id);

      const unifiedUser: UnifiedUser = {
        userId: user.id,
        organizationId: user.organization_id,
        role: user.role,
        plan: user.plan,
        id: user.id,
        email: user.email,
        user_metadata: {},
        app_metadata: {
          api_key_id: keyRecord.id,
          api_key_name: keyRecord.name,
          api_key_permissions: keyRecord.permissions,
        },
      };

      return unifiedUser;
    }

    return null;
  } catch (error) {
    logger.error('Internal API key validation error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}

declare module 'express' {
  interface Request {
    user?: UnifiedUser;
  }
}

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const apiKey = req.headers['x-api-key'] as string;

    let token: string | undefined;
    let isBearerToken = false;

    // Check for Bearer token
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7);
      isBearerToken = true;
    } else if (apiKey) {
      token = apiKey;
    }

    if (!token) {
      res.status(401).json({
        error: 'Authentication required',
        message: 'Please provide a valid Bearer token or API key'
      });
      return;
    }

    if (isBearerToken) {
      try {
        const decoded = jwt.verify(token, env.JWT_SECRET) as JWTPayload;

        req.user = decoded;

        logger.debug('User authenticated via JWT', {
          userId: decoded.userId,
          organizationId: decoded.organizationId,
          role: decoded.role
        });

        next();
        return;
      } catch (jwtError) {
        logger.warn('Invalid JWT provided', {
          error: jwtError instanceof Error ? jwtError.message : 'Unknown error',
          token: token.substring(0, 20) + '...'
        });

        res.status(401).json({
          error: 'Invalid token',
          message: 'The provided token is invalid or expired'
        });
        return;
      }
    }

    if (apiKey) {
      const user = await validateInternalApiKey(apiKey);

      if (!user) {
        res.status(401).json({
          error: 'Invalid API key',
          message: 'The provided API key is invalid, expired, or inactive'
        });
        return;
      }

      req.user = user;

      logger.debug('User authenticated via internal API key', {
        userId: user.userId,
        organizationId: user.organizationId,
        role: user.role
      });

      next();
      return;
    }
  } catch (error) {
    logger.error('Authentication middleware error', { error });
    res.status(500).json({
      error: 'Authentication error',
      message: 'An error occurred during authentication'
    });
    return;
  }
};

export const requireRole = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Authentication required',
        message: 'User not authenticated'
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: 'Insufficient permissions',
        message: `This action requires one of the following roles: ${allowedRoles.join(', ')}`
      });
      return;
    }

    next();
  };
};

export const requirePlan = (allowedPlans: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Authentication required',
        message: 'User not authenticated'
      });
      return;
    }

    if (!allowedPlans.includes(req.user.plan)) {
      res.status(403).json({
        error: 'Plan upgrade required',
        message: `This feature requires one of the following plans: ${allowedPlans.join(', ')}`
      });
      return;
    }

    next();
  };
};
