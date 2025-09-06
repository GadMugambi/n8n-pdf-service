import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { AppError } from './errors';

export class FileUtils {
  static async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch (error) {
      try {
        await fs.mkdir(dirPath, { recursive: true });
      } catch (mkdirError) {
        throw new AppError(
          `Failed to create directory: ${dirPath}`, 
          500, 
          'DIRECTORY_CREATE_ERROR'
        );
      }
    }
  }

  static generateKey(): string {
    return uuidv4();
  }

  static async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  static async deleteFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code !== 'ENOENT') {
        throw new AppError(
          `Failed to delete file: ${filePath}`, 
          500, 
          'FILE_DELETE_ERROR'
        );
      }
    }
  }

  static async getFileStats(filePath: string) {
    try {
      return await fs.stat(filePath);
    } catch (error) {
      throw new AppError(
        `File not found: ${filePath}`, 
        404, 
        'FILE_NOT_FOUND'
      );
    }
  }

  static sanitizeFilename(filename: string): string {
    if (!filename || typeof filename !== 'string') {
      throw new AppError('Invalid filename provided', 400, 'INVALID_FILENAME');
    }
    
    return filename
      .replace(/[^a-zA-Z0-9\-_.]/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_+|_+$/g, '') // Remove leading/trailing underscores
      .slice(0, 200); // Reasonable length limit
  }

  static getTruncatedFileName(originalName: string): string {
    if (!originalName || typeof originalName !== 'string') {
      throw new AppError('Invalid original filename', 400, 'INVALID_FILENAME');
    }
    
    const ext = path.extname(originalName);
    const baseName = path.basename(originalName, ext);
    return `${baseName}_truncated${ext}`;
  }

  static getUploadPath(filename: string): string {
    return path.join(config.uploadDir, filename);
  }

  static getProcessedPath(filename: string): string {
    return path.join(config.processedDir, filename);
  }

  static validateFileExtension(filename: string, allowedExtensions: string[]): boolean {
    const ext = path.extname(filename).toLowerCase();
    return allowedExtensions.includes(ext);
  }

  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}