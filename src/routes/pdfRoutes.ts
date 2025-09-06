import { Router, Request, Response, NextFunction } from 'express';
import { PdfService } from '../services/pdfService';
import { StorageService } from '../services/storageService';
import { upload } from '../middleware/upload';
import { validateTruncationRequest } from '../utils/validation';
import { FileUtils } from '../utils/fileUtils';
import { ValidationError, NotFoundError } from '../utils/errors';
import path from 'path';

export function createPdfRoutes(pdfService: PdfService, storageService: StorageService): Router {
  const router = Router();

  // Upload and process PDF
  router.post('/upload-and-truncate', upload.single('pdf'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        throw new ValidationError('PDF file is required');
      }

      const file = req.file;
      const fileKey = req.body.fileKey;
      
      // Validate PDF
      await pdfService.validatePdf(file.path);
      
      // Store original file
      await storageService.storeFile(
        fileKey,
        file.originalname,
        file.filename,
        file.path,
        file.size,
        file.mimetype
      );

      // Validate truncation request
      const truncationRequest = validateTruncationRequest(req.body);
      
      // Process PDF truncation
      const keys = await pdfService.processPdfTruncation(fileKey, truncationRequest);
      
      res.status(201).json({
        success: true,
        data: {
          keys,
          message: 'PDF uploaded and truncation started successfully'
        }
      });
    } catch (error) {
      next(error);
    }
  });

  // Upload PDF only (without processing)
  router.post('/upload', upload.single('pdf'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        throw new ValidationError('PDF file is required');
      }

      const file = req.file;
      const fileKey = req.body.fileKey;
      
      // Validate PDF
      const pdfInfo = await pdfService.validatePdf(file.path);
      
      // Store original file
      const storedFile = await storageService.storeFile(
        fileKey,
        file.originalname,
        file.filename,
        file.path,
        file.size,
        file.mimetype
      );

      res.status(201).json({
        success: true,
        data: {
          key: fileKey,
          originalName: storedFile.originalName,
          size: storedFile.size,
          pageCount: pdfInfo.pageCount,
          message: 'PDF uploaded successfully'
        }
      });
    } catch (error) {
      next(error);
    }
  });

  // Start truncation process
  router.post('/truncate/:key', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { key } = req.params;
      
      // Validate truncation request
      const truncationRequest = validateTruncationRequest(req.body);
      
      // Process PDF truncation
      const keys = await pdfService.processPdfTruncation(key, truncationRequest);
      
      res.json({
        success: true,
        data: {
          keys,
          message: 'PDF truncation started successfully'
        }
      });
    } catch (error) {
      next(error);
    }
  });

  // Check processing status
  router.get('/status/:key', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { key } = req.params;
      const status = await storageService.getProcessingStatus(key);
      
      res.json({
        success: true,
        data: status
      });
    } catch (error) {
      next(error);
    }
  });

  // Download truncated PDF
  router.get('/download/:key', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { key } = req.params;
      const file = await storageService.getFile(key);
      
      if (!(await FileUtils.fileExists(file.filePath))) {
        throw new NotFoundError('File not found on disk');
      }
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);
      res.setHeader('Content-Length', file.size.toString());
      
      res.sendFile(path.resolve(file.filePath));
    } catch (error) {
      next(error);
    }
  });

  // Delete truncated PDF
  router.delete('/truncated/:key', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { key } = req.params;
      await storageService.deleteFile(key);
      
      res.json({
        success: true,
        message: 'Truncated PDF deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  });

  // Delete original PDF
  router.delete('/original/:key', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { key } = req.params;
      await storageService.deleteFile(key);
      
      res.json({
        success: true,
        message: 'Original PDF deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  });

  // Get file info
  router.get('/info/:key', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { key } = req.params;
      const file = await storageService.getFile(key);
      
      res.json({
        success: true,
        data: {
          key: file.key,
          originalName: file.originalName,
          size: file.size,
          mimeType: file.mimeType,
          createdAt: file.createdAt
        }
      });
    } catch (error) {
      next(error);
    }
  });

  // List all files
  router.get('/list', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const files = storageService.listFiles();
      
      res.json({
        success: true,
        data: {
          files: files.map(file => ({
            key: file.key,
            originalName: file.originalName,
            size: file.size,
            createdAt: file.createdAt
          })),
          count: files.length
        }
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}