import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { UnauthorizedError } from '../utils/errors';

export const authenticateApiKey = (req: Request, res: Response, next: NextFunction): void => {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  
  if (!apiKey) {
    throw new UnauthorizedError('API key is required. Provide it via X-API-Key header or Authorization header.');
  }
  
  if (apiKey !== config.apiKey) {
    throw new UnauthorizedError('Invalid API key provided.');
  }
  
  next();
};