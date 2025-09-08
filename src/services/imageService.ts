import fs from 'fs/promises';
import path from 'path';
// No change to this import
import { Poppler } from 'node-poppler';
import { PDFDocument } from 'pdf-lib';
import { ImageConversionRequest, ImageKeys, StoredImage } from '../types';
import { FileUtils } from '../utils/fileUtils';
import { ProcessingError, ValidationError, NotFoundError } from '../utils/errors';
import { StorageService } from './storageService';

export class ImageService {
  private poppler: Poppler;

  constructor(private storageService: StorageService) {
    // Check for an environment variable specifying the Poppler binary path.
    // This makes the code adaptable to different environments.
    const popplerBinPath = process.env.POPPLER_BIN_PATH_WINDOWS;

    if (popplerBinPath) {
      console.log(`Using custom Poppler path: ${popplerBinPath}`);
      this.poppler = new Poppler(popplerBinPath);
    } else {
      console.log('Using Poppler from system PATH.');
      this.poppler = new Poppler();
    }
  }

  async processPdfToImages(
    originalKey: string,
    request: ImageConversionRequest
  ): Promise<ImageKeys> {
    try {
      // Set initial processing status
      await this.storageService.setImageProcessingStatus(originalKey, {
        status: 'processing',
        progress: 0,
        createdAt: new Date()
      });

      const originalFile = await this.storageService.getFile(originalKey);
      
      // Load the original PDF to get page count
      const pdfBytes = await fs.readFile(originalFile.filePath);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const totalPages = pdfDoc.getPageCount();
      
      // Validate and get page indices
      const pagesToConvert = this.getPageIndices(request, totalPages);
      
      await this.storageService.updateImageProcessingStatus(originalKey, {
        status: 'processing',
        progress: 25
      });

      // Prepare conversion options
      const outputDir = FileUtils.getImagesDir();
      await FileUtils.ensureDirectoryExists(outputDir);
      
      const conversionPromises = pagesToConvert.map(async (pageIndex, index) => {
        const pageNumber = pageIndex + 1; // Convert back to 1-based
        const imageKey = FileUtils.generateKey();
        const imageFileName = `${imageKey}_page_${pageNumber}.${request.format || 'png'}`;
        const imageFilePath = path.join(outputDir, imageFileName);
        
        // Define the output file prefix for Poppler
        const outputFilePrefix = path.join(outputDir, `${imageKey}_page_${pageNumber}`);

        // Convert single page to image
        const options = {
          firstPageToConvert: pageNumber,
          lastPageToConvert: pageNumber,
          pngFile: request.format === 'png' || !request.format,
          jpegFile: request.format === 'jpeg',
          tiffFile: request.format === 'tiff',
          scalePageTo: request.scale ? Math.round((request.scale || 1) * 1024) : 1024
        };

        try {
          // CORRECTED: Pass the outputFilePrefix as the second argument
          await this.poppler.pdfToCairo(originalFile.filePath, outputFilePrefix, options);
          
          // Get the actual file size
          const stats = await FileUtils.getFileStats(imageFilePath);
          
          // Store image info
          const storedImage: StoredImage = {
            key: imageKey,
            originalName: `page_${pageNumber}.${request.format || 'png'}`,
            fileName: imageFileName,
            filePath: imageFilePath,
            size: stats.size,
            mimeType: this.getMimeType(request.format || 'png'),
            pageNumber,
            format: request.format || 'png',
            createdAt: new Date()
          };

          await this.storageService.storeImage(imageKey, storedImage);
          return imageKey;
        } catch (error) {
          console.error(`Failed to convert page ${pageNumber}:`, error);
          throw new ProcessingError(`Failed to convert page ${pageNumber} to image`);
        }
      });

      await this.storageService.updateImageProcessingStatus(originalKey, {
        status: 'processing',
        progress: 75
      });

      // Wait for all conversions to complete
      const imageKeys = await Promise.all(conversionPromises);

      // Update processing status to completed
      await this.storageService.updateImageProcessingStatus(originalKey, {
        status: 'completed',
        progress: 100,
        completedAt: new Date()
      });

      return {
        originalKey,
        imageKeys
      };

    } catch (error) {
      // Update processing status to error
      await this.storageService.updateImageProcessingStatus(originalKey, {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        completedAt: new Date()
      });
      
      throw error;
    }
  }

  // ... (The rest of your class methods 'getPageIndices' and 'getMimeType' are correct and do not need changes)
  private getPageIndices(request: ImageConversionRequest, totalPages: number): number[] {
    if (request.pages) {
      // Validate individual pages
      const invalidPages = request.pages.filter(page => page < 1 || page > totalPages);
      if (invalidPages.length > 0) {
        throw new ValidationError(
          `Invalid page numbers: ${invalidPages.join(', ')}. PDF has ${totalPages} pages.`
        );
      }
      return request.pages.map(page => page - 1); // Convert to 0-based indexing
    }

    if (request.pageRange) {
      const { start, end = totalPages } = request.pageRange;
      
      if (start < 1 || start > totalPages) {
        throw new ValidationError(`Start page ${start} is invalid. PDF has ${totalPages} pages.`);
      }
      
      if (end > totalPages) {
        throw new ValidationError(`End page ${end} is invalid. PDF has ${totalPages} pages.`);
      }

      const pages: number[] = [];
      for (let i = start; i <= end; i++) {
        pages.push(i - 1); // Convert to 0-based indexing
      }
      return pages;
    }

    // If neither pages nor pageRange specified, convert all pages
    const allPages: number[] = [];
    for (let i = 0; i < totalPages; i++) {
      allPages.push(i);
    }
    return allPages;
  }

  private getMimeType(format: string): string {
    switch (format.toLowerCase()) {
      case 'png':
        return 'image/png';
      case 'jpeg':
      case 'jpg':
        return 'image/jpeg';
      case 'tiff':
      case 'tif':
        return 'image/tiff';
      default:
        return 'image/png';
    }
  }
}