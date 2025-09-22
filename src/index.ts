// src/index.ts

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { authenticateApiKey } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';
import { createPdfRoutes } from './routes/pdfRoutes';
import { createImageRoutes } from './routes/imageRoutes';
import { PdfService } from './services/pdfService';
import { ImageService } from './services/imageService';
import { StorageService } from './services/storageService';
import { DatabaseService } from './services/databaseService';
import { FileUtils } from './utils/fileUtils';

// We define this variable here to be accessible by the graceful shutdown handlers.
let databaseService: DatabaseService;

async function startServer() {
  try {
    // --- STEP 1: Create ALL necessary directories FIRST ---
    // This ensures that the filesystem is ready before any service tries to use it.
    console.log('Ensuring all data directories exist...');
    await FileUtils.ensureDirectoryExists(config.uploadDir);
    await FileUtils.ensureDirectoryExists(config.processedDir);
    await FileUtils.ensureDirectoryExists(config.imagesDir);
    await FileUtils.ensureDirectoryExists(config.dbDir); // This was the missing piece.
    console.log('All data directories are ready.');

    // --- STEP 2: NOW that directories exist, initialize the services ---
    // Assign to the outer-scoped variable
    databaseService = new DatabaseService(config.dbPath);
    databaseService.init();

    const storageService = new StorageService(databaseService);
    const pdfService = new PdfService(storageService);
    const imageService = new ImageService(storageService);

    // --- STEP 3: Create and configure the Express app ---
    const app = express();

    // Security middleware
    app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
    app.use(cors({ origin: config.corsOrigins, credentials: true }));

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
          description: 'Service for uploading, truncating, and converting PDF files to images',
          endpoints: {
            // PDF endpoints
            'POST /api/pdf/upload-and-truncate': 'Upload PDF and start truncation',
            'POST /api/pdf/upload': 'Upload PDF only',
            'POST /api/pdf/truncate/:key': 'Start truncation for uploaded PDF',
            'GET /api/pdf/status/:key': 'Check processing status',
            'GET /api/pdf/download/:key': 'Download processed PDF',
            'GET /api/pdf/info/:key': 'Get file information',
            'GET /api/pdf/list': 'List all files',
            'DELETE /api/pdf/truncated/:key': 'Delete truncated PDF',
            'DELETE /api/pdf/original/:key': 'Delete original PDF',
            // Image endpoints
            'POST /api/images/convert/:key': 'Convert PDF pages to images',
            'GET /api/images/status/:key': 'Check image processing status',
            'GET /api/images/download/:imageKey': 'Download specific image',
            'GET /api/images/list/:originalKey': 'List all images for original PDF',
            'GET /api/images/info/:imageKey': 'Get image information',
            'DELETE /api/images/:imageKey': 'Delete specific image',
            'DELETE /api/images/original/:originalKey': 'Delete all images for original PDF'
          },
          authentication: 'API Key required in X-API-Key header or Authorization header',
          supportedFormats: {
            upload: ['application/pdf'],
            imageFormats: ['png', 'jpeg', 'tiff']
          },
          maxFileSize: `${config.maxFileSize} bytes (${Math.round(config.maxFileSize / 1024 / 1024)}MB)`
        }
      });
    });

    // Apply authentication to all main API routes
    app.use('/api', authenticateApiKey);

    // PDF routes
    app.use('/api/pdf', createPdfRoutes(pdfService, storageService));

    // Image routes
    app.use('/api/images', createImageRoutes(imageService, storageService));

    // 404 handler
    app.use((req, res) => {
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

    // --- STEP 4: Start listening for requests ---
    const server = app.listen(config.port, () => {
      console.log(`
🚀 PDF Processing Service Started
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 Server:     http://localhost:${config.port}
🏥 Health:     http://localhost:${config.port}/health
📖 Docs:       http://localhost:${config.port}/api-docs
🔒 Auth:       API Key required (X-API-Key header)
🗂️  Upload:     ${config.uploadDir}
📁 Processed:  ${config.processedDir}
🖼️  Images:     ${config.imagesDir}
🗄️  Database:   ${config.dbPath}
🎯 Max Size:   ${Math.round(config.maxFileSize / 1024 / 1024)}MB
🌍 Environment: ${config.nodeEnv}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      `);
    });

    // Graceful shutdown handlers need access to the server and db connection
    const shutdown = (signal: string) => {
      console.log(`🔄 ${signal} received, shutting down gracefully...`);
      server.close(() => {
        console.log('HTTP server closed.');
        if (databaseService && databaseService.db) {
          try {
            // The .close() method is synchronous and does not take a callback.
            databaseService.db.close();
            console.log('Database connection closed.');
          } catch (err: any) {
            console.error('Error closing database:', err.message);
            process.exit(1); // Exit with an error code if db close fails
          }
        }
        process.exit(0); // Exit cleanly
      });
    };
    
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Handle uncaught exceptions/rejections
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the application
startServer();