import multer from 'multer';
import path from 'path';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { FileUtils } from '../utils/fileUtils';
import { ValidationError, AppError } from '../utils/errors';
import { UploadProgressService } from '../services/uploadProgressService';
import { logger } from '../services/logger';

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await FileUtils.ensureDirectoryExists(config.uploadDir);
      cb(null, config.uploadDir);
    } catch (error) {
      const errorMsg = error instanceof Error ? error : new Error('Unknown error occurred');
      cb(errorMsg, '');
    }
  },
  filename: (req, file, cb) => {
    try {
      const key = FileUtils.generateKey();
      const sanitizedName = FileUtils.sanitizeFilename(file.originalname);
      const filename = `${key}_${sanitizedName}`;
      
      // Store the key for later use
      if (!req.body) {
        req.body = {};
      }
      req.body.fileKey = key;
      
      cb(null, filename);
    } catch (error) {
      const errorMsg = error instanceof Error ? error : new Error('Failed to generate filename');
      cb(errorMsg, '');
    }
  }
});

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  try {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      const error = new ValidationError('Only PDF files are allowed');
      cb(error);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error : new Error('File validation failed');
    cb(errorMsg);
  }
};

const multerUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.maxFileSize, // Maximum size of each file in bytes
    files: 1, // Maximum number of files
    fields: 10, // Maximum number of non-file fields
    fieldNameSize: 100, // Maximum field name size in bytes
    fieldSize: 1024 * 1024, // Maximum field value size in bytes (1MB)
    parts: 20 // Maximum number of parts (fields + files)
  }
});

export const handleUploadWithProgress = (uploadProgressService: UploadProgressService) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const uploadId = req.headers['x-upload-id'] as string;
    if (!uploadId) {
      return next(new ValidationError('X-Upload-ID header is required for uploads.'));
    }

    const contentLength = req.headers['content-length'];
    if (!contentLength) {
      return next(new AppError('Content-Length header is required.', 411, 'LENGTH_REQUIRED'));
    }

    try {
      uploadProgressService.startUpload(uploadId, parseInt(contentLength, 10));
    } catch (e) {
      return next(new ValidationError('Invalid or expired Upload ID. Please initiate the upload again.'));
    }
    
    let loaded = 0;
    req.on('data', (chunk) => {
      loaded += chunk.length;
      uploadProgressService.updateProgress(uploadId, loaded);
    });

    req.on('end', () => {
      uploadProgressService.completeUpload(uploadId);
    });

    req.on('error', (err) => {
      logger.error({ err, uploadId }, 'Error during file upload stream.');
      uploadProgressService.failUpload(uploadId, err.message);
    });

    // Pass control to the multer middleware
    multerUpload.single('pdf')(req, res, (err) => {
      if (err) {
        // If multer throws an error, fail the progress
        uploadProgressService.failUpload(uploadId, err.message);
      }
      next(err);
    });
  };
};