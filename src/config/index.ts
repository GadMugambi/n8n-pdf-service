import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000'),
  nodeEnv: process.env.NODE_ENV || 'development',
  apiKey: process.env.API_KEY || 'default-api-key',
  uploadDir: path.resolve(process.env.UPLOAD_DIR || 'uploads'),
  processedDir: path.resolve(process.env.PROCESSED_DIR || 'processed'),
  imagesDir: path.resolve(process.env.IMAGES_DIR || 'images'),
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '52428800'), // 50MB
  corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
} as const;

// Validate required environment variables
if (!process.env.API_KEY) {
  console.warn('⚠️  Warning: API_KEY not set in environment variables. Using default key.');
}