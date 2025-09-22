import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { UnauthorizedError } from '../utils/errors';
import { logger } from '../services/logger';

export const authenticateApiKey = (req: Request, res: Response, next: NextFunction): void => {
  // The header value can be a string, an array of strings, or undefined.
  const rawApiKeyHeader = req.headers['x-api-key'] || req.headers['authorization'];

  // We only care about the first value if it's an array.
  const apiKeyHeaderString = Array.isArray(rawApiKeyHeader) ? rawApiKeyHeader[0] : rawApiKeyHeader;
  
  // Now, we can safely process the string.
  const apiKey = apiKeyHeaderString?.replace('Bearer ', '');
  
  if (!apiKey) {
    logger.warn({ ip: req.ip }, 'API key is required but was not provided.');
    throw new UnauthorizedError('API key is required. Provide it via X-API-Key header or Authorization header.');
  }
  
  if (apiKey !== config.apiKey) {
    // `apiKey` is now guaranteed to be a string, so .substring is safe.
    logger.warn({ ip: req.ip, providedKey: `${apiKey.substring(0, 4)}...` }, 'Invalid API key provided.');
    throw new UnauthorizedError('Invalid API key provided.');
  }
  
  next();
};