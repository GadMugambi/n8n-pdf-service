import fs from 'fs/promises';
import { PDFDocument } from 'pdf-lib';
import { TruncationRequest, FileKeys, PageRange } from '../types';
import { FileUtils } from '../utils/fileUtils';
import { ProcessingError, ValidationError, NotFoundError } from '../utils/errors';
import { StorageService } from './storageService';

export class PdfService {
  constructor(private storageService: StorageService) {}

  async processPdfTruncation(
    originalKey: string,
    request: TruncationRequest
  ): Promise<FileKeys> {
    try {
      // Set initial processing status
      await this.storageService.setProcessingStatus(originalKey, {
        status: 'processing',
        progress: 0,
        createdAt: new Date()
      });

      const originalFile = await this.storageService.getFile(originalKey);
      
      // Load the original PDF
      const pdfBytes = await fs.readFile(originalFile.filePath);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      
      const totalPages = pdfDoc.getPageCount();
      
      // Validate page requests
      const pagesToExtract = this.getPageIndices(request, totalPages);
      
      await this.storageService.updateProcessingStatus(originalKey, {
        status: 'processing',
        progress: 25
      });

      // Create new PDF with selected pages
      const newPdfDoc = await PDFDocument.create();
      const copiedPages = await newPdfDoc.copyPages(pdfDoc, pagesToExtract);
      
      copiedPages.forEach((page) => {
        newPdfDoc.addPage(page);
      });

      await this.storageService.updateProcessingStatus(originalKey, {
        status: 'processing',
        progress: 75
      });

      // Save the truncated PDF
      const truncatedPdfBytes = await newPdfDoc.save();
      const truncatedKey = FileUtils.generateKey();
      const truncatedFileName = `${truncatedKey}_${FileUtils.getTruncatedFileName(originalFile.originalName)}`;
      const truncatedFilePath = FileUtils.getProcessedPath(truncatedFileName);

      await fs.writeFile(truncatedFilePath, truncatedPdfBytes);

      // Store truncated file info
      await this.storageService.storeFile(
        truncatedKey,
        FileUtils.getTruncatedFileName(originalFile.originalName),
        truncatedFileName,
        truncatedFilePath,
        truncatedPdfBytes.length,
        'application/pdf'
      );

      // Update processing status to completed
      await this.storageService.updateProcessingStatus(originalKey, {
        status: 'completed',
        progress: 100,
        completedAt: new Date()
      });

      return {
        originalKey,
        truncatedKey
      };

    } catch (error) {
      // Update processing status to error
      await this.storageService.updateProcessingStatus(originalKey, {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        completedAt: new Date()
      });
      
      throw error;
    }
  }

  private getPageIndices(request: TruncationRequest, totalPages: number): number[] {
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

    throw new ValidationError('Either pages or pageRange must be specified');
  }

  async validatePdf(filePath: string): Promise<{ pageCount: number; isValid: boolean }> {
    try {
      const pdfBytes = await fs.readFile(filePath);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const pageCount = pdfDoc.getPageCount();
      
      return {
        pageCount,
        isValid: true
      };
    } catch (error) {
      throw new ProcessingError(`Invalid PDF file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}