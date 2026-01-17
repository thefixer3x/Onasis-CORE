// Service routes and rate-limit configuration (canonicalized from legacy router)
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

const createRateLimit = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  message: { error: message, code: 'RATE_LIMIT_EXCEEDED' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const sessionId = req.headers['x-session-id'] ||
                     req.headers['authorization']?.substring(0, 20) ||
                     req.headers['x-api-key']?.substring(0, 20) ||
                     'anonymous';
    return crypto.createHash('sha256').update(sessionId).digest('hex').substring(0, 16);
  }
});

const SERVICE_ROUTES = {
  'ai-chat': {
    path: '/functions/v1/ai-chat',
    rateLimit: createRateLimit(60 * 1000, 100, 'AI API rate limit exceeded'),
    description: 'Multi-model AI conversation with privacy protection'
  },
  'text-to-speech': {
    path: '/functions/v1/elevenlabs-tts',
    rateLimit: createRateLimit(60 * 1000, 50, 'Media processing rate limit exceeded'),
    description: 'Privacy-protected text-to-speech conversion'
  },
  'speech-to-text': {
    path: '/functions/v1/elevenlabs-stt',
    rateLimit: createRateLimit(60 * 1000, 50, 'Media processing rate limit exceeded'),
    description: 'Privacy-protected speech-to-text transcription'
  },
  'transcribe': {
    path: '/functions/v1/whisper-transcribe',
    rateLimit: createRateLimit(60 * 1000, 50, 'Media processing rate limit exceeded'),
    description: 'Advanced speech transcription with privacy'
  },
  'extract-tags': {
    path: '/functions/v1/extract-tags',
    rateLimit: createRateLimit(60 * 1000, 500, 'General API rate limit exceeded'),
    description: 'AI-powered content tag extraction'
  },
  'generate-summary': {
    path: '/functions/v1/generate-summary',
    rateLimit: createRateLimit(60 * 1000, 500, 'General API rate limit exceeded'),
    description: 'Intelligent content summarization'
  },
  'generate-embedding': {
    path: '/functions/v1/generate-embedding',
    rateLimit: createRateLimit(60 * 1000, 500, 'General API rate limit exceeded'),
    description: 'Vector embedding generation for semantic search'
  },
  'mcp-handler': {
    path: '/functions/v1/mcp-handler',
    rateLimit: createRateLimit(60 * 1000, 500, 'General API rate limit exceeded'),
    description: 'Model Context Protocol tool integration hub'
  }
};

module.exports = { SERVICE_ROUTES };

