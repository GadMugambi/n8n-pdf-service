import { Router, Request, Response, NextFunction } from 'express';
import { ImageService } from '../services/imageService';
import { StorageService } from '../services/storageService';
import { validateImageConversionRequest } from '../utils/validation';
import { ValidationError, NotFoundError } from '../utils/errors';
import path from 'path';

export function createImageRoutes(imageService: ImageService, storageService: StorageService): Router {
  const router = Router();

  // Convert PDF pages to images
  router.post('/convert/:key', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { key } = req.params;
      
      // Validate image conversion request
      const conversionRequest = validateImageConversionRequest(req.body);
      
      // Process PDF to images conversion
      const keys = await imageService.processPdfToImages(key, conversionRequest);
      
      res.json({
        success: true,
        data: {
          keys,
          message: 'PDF to images conversion started successfully'
        }
      });
    } catch (error) {
      next(error);
    }
  });

  // Check image processing status
  router.get('/status/:key', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { key } = req.params;
      const status = await storageService.getImageProcessingStatus(key);
      
      res.json({
        success: true,
        data: status
      });
    } catch (error) {
      next(error);
    }
  });

  // Download specific image by image key
  router.get('/download/:imageKey', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { imageKey } = req.params;
      const image = await storageService.getImage(imageKey);
      
      res.setHeader('Content-Type', image.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${image.originalName}"`);
      res.setHeader('Content-Length', image.size.toString());
      
      res.sendFile(path.resolve(image.filePath));
    } catch (error) {
      next(error);
    }
  });

  // List all images for a specific original PDF key
  router.get('/list/:originalKey', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { originalKey } = req.params;
      const images = storageService.getImagesByOriginalKey(originalKey);
      
      res.json({
        success: true,
        data: {
          images: images.map(image => ({
            key: image.key,
            originalName: image.originalName,
            pageNumber: image.pageNumber,
            format: image.format,
            size: image.size,
            createdAt: image.createdAt
          })),
          count: images.length
        }
      });
    } catch (error) {
      next(error);
    }
  });

  // Delete specific image by image key
  router.delete('/:imageKey', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { imageKey } = req.params;
      await storageService.deleteImage(imageKey);
      
      res.json({
        success: true,
        message: 'Image deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  });

  // Delete all images for a specific original PDF key
  router.delete('/original/:originalKey', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { originalKey } = req.params;
      await storageService.deleteImagesByOriginalKey(originalKey);
      
      res.json({
        success: true,
        message: 'All images deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  });

  // Get image info
  router.get('/info/:imageKey', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { imageKey } = req.params;
      const image = await storageService.getImage(imageKey);
      
      res.json({
        success: true,
        data: {
          key: image.key,
          originalName: image.originalName,
          pageNumber: image.pageNumber,
          format: image.format,
          size: image.size,
          mimeType: image.mimeType,
          createdAt: image.createdAt
        }
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}