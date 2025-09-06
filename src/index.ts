// src/index.ts

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { authenticateApiKey } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';
import { createPdfRoutes } from './routes/pdfRoutes';
import { PdfService } from './services/pdfService';
import { StorageService } from './services/storageService';
import { FileUtils } from './utils/fileUtils';

const app = express();

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(cors({
  origin: config.corsOrigins,
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'PDF Service is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// API documentation endpoint (no auth required)
app.get('/api-docs', (req, res) => {
  res.json({
    success: true,
    data: {
      title: 'PDF Processing Service API',
      version: '1.0.0',
      description: 'Service for uploading, truncating, and managing PDF files',
      endpoints: {
        'POST /api/pdf/upload-and-truncate': 'Upload PDF and start truncation',
        'POST /api/pdf/upload': 'Upload PDF only',
        'POST /api/pdf/truncate/:key': 'Start truncation for uploaded PDF',
        'GET /api/pdf/status/:key': 'Check processing status',
        'GET /api/pdf/download/:key': 'Download processed PDF',
        'GET /api/pdf/info/:key': 'Get file information',
        'GET /api/pdf/list': 'List all files',
        'DELETE /api/pdf/truncated/:key': 'Delete truncated PDF',
        'DELETE /api/pdf/original/:key': 'Delete original PDF'
      },
      authentication: 'API Key required in X-API-Key header or Authorization header',
      supportedFormats: ['application/pdf'],
      maxFileSize: `${config.maxFileSize} bytes (${Math.round(config.maxFileSize / 1024 / 1024)}MB)`
    }
  });
});

// Initialize services
const storageService = new StorageService();
const pdfService = new PdfService(storageService);

// Apply authentication to all PDF routes
app.use('/api/pdf', authenticateApiKey);

// PDF routes
app.use('/api/pdf', createPdfRoutes(pdfService, storageService));

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl} not found`
    }
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Initialize directories and start server
async function startServer() {
  try {
    // Ensure required directories exist
    await FileUtils.ensureDirectoryExists(config.uploadDir);
    await FileUtils.ensureDirectoryExists(config.processedDir);
    
    app.listen(config.port, () => {
      console.log(`
🚀 PDF Processing Service Started
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 Server:     http://localhost:${config.port}
🏥 Health:     http://localhost:${config.port}/health
📖 Docs:       http://localhost:${config.port}/api-docs
🔒 Auth:       API Key required (X-API-Key header)
🗂️  Upload:     ${config.uploadDir}
📁 Processed:  ${config.processedDir}
🎯 Max Size:   ${Math.round(config.maxFileSize / 1024 / 1024)}MB
🌍 Environment: ${config.nodeEnv}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      `);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🔄 SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🔄 SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

startServer();