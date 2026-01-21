import { dbPool } from '../../db/client.js';
import { logger } from '../utils/logger.js';
const DEFAULT_SCOPE = 'lanonasis-maas';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function resolveProjectScope(options) {
    const fallbackScope = options.fallbackScope || DEFAULT_SCOPE;
    const requestedScope = options.requestedScope?.trim();
    if (!requestedScope) {
        return { scope: fallbackScope, validated: true, reason: 'missing_scope' };
    }
    if (requestedScope === fallbackScope) {
        return { scope: requestedScope, validated: true, reason: 'default_scope' };
    }
    if (UUID_REGEX.test(requestedScope)) {
        try {
            const result = await dbPool.query(`
        SELECT id
        FROM security_service.api_key_projects
        WHERE id = $1
          AND ($2 = owner_id OR $2 = ANY(COALESCE(team_members, '{}'::uuid[])))
        LIMIT 1
        `, [requestedScope, options.userId]);
            if ((result.rowCount ?? 0) > 0) {
                return { scope: requestedScope, validated: true };
            }
            logger.warn('Project scope not permitted for user', {
                userId: options.userId,
                requestedScope,
                context: options.context,
            });
            return { scope: fallbackScope, validated: false, reason: 'project_membership_denied' };
        }
        catch (error) {
            logger.warn('Project scope membership lookup failed', {
                userId: options.userId,
                requestedScope,
                context: options.context,
                error,
            });
            return { scope: requestedScope, validated: false, reason: 'membership_lookup_failed' };
        }
    }
    try {
        const result = await dbPool.query(`
      WITH matches AS (
        SELECT id, owner_id, team_members
        FROM security_service.api_key_projects
        WHERE LOWER(name) = LOWER($1)
           OR LOWER(COALESCE(settings->>'slug', '')) = LOWER($1)
      )
      SELECT
        EXISTS(SELECT 1 FROM matches) AS exists,
        EXISTS(
          SELECT 1 FROM matches
          WHERE $2 = owner_id OR $2 = ANY(COALESCE(team_members, '{}'::uuid[]))
        ) AS member
      `, [requestedScope, options.userId]);
        const row = result.rows[0];
        if (row?.member) {
            return { scope: requestedScope, validated: true };
        }
        if (row?.exists && !row.member) {
            logger.warn('Project scope not permitted for user', {
                userId: options.userId,
                requestedScope,
                context: options.context,
            });
            return { scope: fallbackScope, validated: false, reason: 'project_membership_denied' };
        }
    }
    catch (error) {
        logger.warn('Project scope lookup failed', {
            userId: options.userId,
            requestedScope,
            context: options.context,
            error,
        });
    }
    logger.info('Project scope accepted without validation', {
        userId: options.userId,
        requestedScope,
        context: options.context,
    });
    return { scope: requestedScope, validated: false, reason: 'unverified_scope' };
}
