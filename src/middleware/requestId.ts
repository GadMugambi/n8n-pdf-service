import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * Middleware to assign a unique ID to each incoming request.
 * This ID is attached to `req.id` and can be used for logging and tracing.
 */
export const assignRequestId = (req: Request, res: Response, next: NextFunction): void => {
  req.id = uuidv4();
  next();
};