import { Router, Request, Response, NextFunction } from 'express';
import { PdfService } from '../services/pdfService';
import { StorageService } from '../services/storageService';
// FIX: Corrected the import path for the upload handler.
import { handleUploadWithProgress } from '../middleware/uploadHandler';
import { validateTruncationRequest } from '../utils/validation';
import { FileUtils } from '../utils/fileUtils';
import { ValidationError, NotFoundError } from '../utils/errors';
import path from 'path';
import { UploadProgressService } from '../services/uploadProgressService';
import { logger } from '../services/logger';

export function createPdfRoutes(
  pdfService: PdfService,
  storageService: StorageService,
  uploadProgressService: UploadProgressService
): Router {
  const router = Router();
  const upload = handleUploadWithProgress(uploadProgressService);

  // New route to initiate an upload and get an ID
  router.post('/initiate-upload', (req: Request, res: Response) => {
    const uploadId = uploadProgressService.initiateUpload();
    logger.info({ uploadId, requestId: req.id }, 'Upload initiated');
    res.status(200).json({
      success: true,
      data: {
        uploadId,
        message: 'Upload initiated. Use this ID in the X-Upload-ID header.'
      }
    });
  });

  // New route to check upload progress
  router.get('/upload-progress/:uploadId', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { uploadId } = req.params;
      const progress = uploadProgressService.getProgress(uploadId);
      if (!progress) {
        throw new NotFoundError('Upload progress not found for this ID.');
      }
      res.status(200).json({
        success: true,
        data: progress
      });
    } catch (error) {
      next(error);
    }
  });


  // Upload and process PDF
  router.post('/upload-and-truncate', upload, async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        throw new ValidationError('PDF file is required');
      }

      const file = req.file;
      const fileKey = req.body.fileKey;
      logger.info({ fileKey, originalName: file.originalname, size: file.size, requestId: req.id }, 'File upload complete, starting processing for upload-and-truncate.');
      
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
  router.post('/upload', upload, async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        throw new ValidationError('PDF file is required');
      }

      const file = req.file;
      const fileKey = req.body.fileKey;
      logger.info({ fileKey, originalName: file.originalname, size: file.size, requestId: req.id }, 'File upload complete, storing file.');
      
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
      logger.info({ key, requestId: req.id }, 'Starting truncation for previously uploaded file.');
      
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