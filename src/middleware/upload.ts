import multer from 'multer';
import path from 'path';
import { config } from '../config';
import { FileUtils } from '../utils/fileUtils';
import { ValidationError } from '../utils/errors';

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

export const upload = multer({
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