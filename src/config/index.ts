import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

// Base directory for persistent data, defaults to a 'persistent_data' folder in the project root
const dataDir = path.resolve(process.env.DATA_DIR || 'persistent_data');

export const config = {
  port: parseInt(process.env.PORT || '3000'),
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  apiKey: process.env.API_KEY || 'default-api-key',
  uploadDir: path.resolve(process.env.UPLOAD_DIR || path.join(dataDir, 'uploads')),
  processedDir: path.resolve(process.env.PROCESSED_DIR || path.join(dataDir, 'processed')),
  imagesDir: path.resolve(process.env.IMAGES_DIR || path.join(dataDir, 'images')),
  dbDir: path.resolve(process.env.DB_DIR || path.join(dataDir, 'database')),
  get dbPath() {
    return path.join(this.dbDir, process.env.DB_FILENAME || 'pdf_service.sqlite');
  },
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '52428800'), // 50MB
  corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
} as const;

// Validate required environment variables
if (!process.env.API_KEY) {
  console.warn('⚠️  Warning: API_KEY not set in environment variables. Using default key.');
}