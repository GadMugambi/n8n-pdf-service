import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { config } from '../config';

// Interface for MulterError
interface MulterError extends Error {
  code: string;
  field?: string;
}

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (res.headersSent) {
    return next(err);
  }

  // Handle operational errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(config.nodeEnv === 'development' && { stack: err.stack })
      }
    });
    return;
  }

  // Handle multer errors
  if (err.name === 'MulterError') {
    const multerErr = err as MulterError;
    let statusCode = 400;
    let message = multerErr.message;
    
    if (multerErr.code === 'LIMIT_FILE_SIZE') {
      message = `File too large. Maximum size is ${config.maxFileSize} bytes.`;
    } else if (multerErr.code === 'LIMIT_UNEXPECTED_FILE') {
      message = 'Unexpected file field.';
    } else if (multerErr.code === 'LIMIT_PART_COUNT') {
      message = 'Too many parts in multipart form.';
    } else if (multerErr.code === 'LIMIT_FILE_COUNT') {
      message = 'Too many files uploaded.';
    } else if (multerErr.code === 'LIMIT_FIELD_KEY') {
      message = 'Field name too long.';
    } else if (multerErr.code === 'LIMIT_FIELD_VALUE') {
      message = 'Field value too long.';
    } else if (multerErr.code === 'LIMIT_FIELD_COUNT') {
      message = 'Too many fields in form.';
    }
    
    res.status(statusCode).json({
      success: false,
      error: {
        code: 'UPLOAD_ERROR',
        message
      }
    });
    return;
  }

  // Handle Joi validation errors
  if (err.name === 'ValidationError') {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: err.message
      }
    });
    return;
  }

  // Handle unknown errors
  console.error('Unexpected error:', err);
  
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An internal server error occurred',
      ...(config.nodeEnv === 'development' && { 
        originalMessage: err.message,
        stack: err.stack 
      })
    }
  });
};