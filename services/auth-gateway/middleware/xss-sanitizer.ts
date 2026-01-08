/**
 * XSS Sanitization Middleware
 * 
 * Sanitizes user input to prevent XSS attacks.
 * Aligned with SHA-256 hashing security standards.
 */

import { Request, Response, NextFunction } from 'express';
import xss from 'xss';

/**
 * XSS sanitization options
 * Configured to be strict while preserving necessary functionality
 */
const xssOptions = {
  whiteList: {}, // No HTML tags allowed by default
  stripIgnoreTag: true,
  stripIgnoreTagBody: ['script'],
  onTagAttr: (tag: string, name: string, value: string) => {
    // Allow data attributes for legitimate use cases
    if (name.startsWith('data-')) {
      return `${name}="${xss(value, xssOptions)}"`;
    }
    return '';
  }
};

/**
 * Recursively sanitize an object/array/string
 */
function sanitizeValue(value: any): any {
  if (typeof value === 'string') {
    return xss(value, xssOptions);
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value && typeof value === 'object') {
    const sanitized: any = {};
    for (const key in value) {
      // Skip sanitization for known safe fields (like hashed values)
      if (key.includes('hash') || key.includes('_hash') || key === 'key_hash') {
        sanitized[key] = value[key];
      } else {
        sanitized[key] = sanitizeValue(value[key]);
      }
    }
    return sanitized;
  }
  return value;
}

/**
 * XSS Sanitization Middleware
 * 
 * Sanitizes:
 * - Query parameters
 * - Request body
 * - URL parameters
 * 
 * Preserves:
 * - Hashed values (key_hash, etc.) - already secure
 * - Binary data
 */
export function xssSanitizer(req: Request, res: Response, next: NextFunction): void {
  try {
    // Sanitize query parameters
    if (req.query) {
      Object.keys(req.query).forEach(key => {
        if (typeof req.query[key] === 'string') {
          req.query[key] = sanitizeValue(req.query[key]);
        } else if (Array.isArray(req.query[key])) {
          req.query[key] = (req.query[key] as any[]).map(sanitizeValue);
        }
      });
    }

    // Sanitize URL parameters
    if (req.params) {
      Object.keys(req.params).forEach(key => {
        if (typeof req.params[key] === 'string') {
          req.params[key] = sanitizeValue(req.params[key]);
        }
      });
    }

    // Sanitize request body (for POST/PUT/PATCH requests)
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeValue(req.body);
    }

    next();
  } catch (error) {
    // If sanitization fails, log and continue (don't break the request)
    console.warn('XSS sanitization warning:', error);
    next();
  }
}

/**
 * Sanitize a single string value
 * Useful for sanitizing specific fields
 */
export function sanitizeString(input: string): string {
  return xss(input, xssOptions);
}

