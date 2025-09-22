import { StoredFile, StoredImage, ProcessingStatus } from '../types';
import { FileUtils } from '../utils/fileUtils';
import { NotFoundError, AppError } from '../utils/errors';
import { DatabaseService } from './databaseService';
import Database from 'better-sqlite3';
import { logger } from './logger';

export class StorageService {
  private db: Database.Database;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.db;
  }
  
  // Helper to convert database rows (with ISO dates) to our object types
  private rowToStoredFile(row: any): StoredFile {
    return { ...row, createdAt: new Date(row.createdAt) };
  }

  private rowToStoredImage(row: any): StoredImage {
    return { ...row, createdAt: new Date(row.createdAt) };
  }

  private rowToProcessingStatus(row: any): ProcessingStatus {
    return {
      ...row,
      error: row.error ? JSON.parse(row.error) : undefined,
      createdAt: new Date(row.createdAt),
      completedAt: row.completedAt ? new Date(row.completedAt) : undefined,
    };
  }

  async storeFile(
    key: string,
    originalName: string,
    fileName: string,
    filePath: string,
    size: number,
    mimeType: string
  ): Promise<StoredFile> {
    const file: StoredFile = {
      key, originalName, fileName, filePath, size, mimeType, createdAt: new Date()
    };
    
    const stmt = this.db.prepare(`
      INSERT INTO files (key, originalName, fileName, filePath, size, mimeType, createdAt)
      VALUES (@key, @originalName, @fileName, @filePath, @size, @mimeType, @createdAt)
    `);
    
    stmt.run({ ...file, createdAt: file.createdAt.toISOString() });
    logger.info({ fileKey: key, originalName }, 'Stored new file in database');
    return file;
  }

  async storeImage(key: string, image: StoredImage): Promise<StoredImage> {
    const stmt = this.db.prepare(`
      INSERT INTO images (key, originalPdfKey, originalName, fileName, filePath, size, mimeType, pageNumber, format, createdAt)
      VALUES (@key, @originalPdfKey, @originalName, @fileName, @filePath, @size, @mimeType, @pageNumber, @format, @createdAt)
    `);
    stmt.run({ ...image, createdAt: image.createdAt.toISOString() });
    logger.info({ imageKey: key, originalPdfKey: image.originalPdfKey, pageNumber: image.pageNumber }, 'Stored new image in database');
    return image;
  }

  async getFile(key: string): Promise<StoredFile> {
    const stmt = this.db.prepare('SELECT * FROM files WHERE key = ?');
    const row = stmt.get(key) as StoredFile; // <-- FIX: Cast the result to the correct type.
    
    if (!row) {
      throw new NotFoundError(`File with key ${key} not found`);
    }

    // Verify file still exists on disk
    if (!(await FileUtils.fileExists(row.filePath))) {
      logger.warn({ fileKey: key, filePath: row.filePath }, 'Database has stale entry for a file that no longer exists on disk. Cleaning up.');
      this.db.prepare('DELETE FROM files WHERE key = ?').run(key); // Clean up stale DB entry
      throw new NotFoundError(`File ${key} no longer exists on disk`);
    }

    return this.rowToStoredFile(row);
  }

  async getImage(key: string): Promise<StoredImage> {
    const stmt = this.db.prepare('SELECT * FROM images WHERE key = ?');
    const row = stmt.get(key) as StoredImage; // <-- FIX: Cast the result to the correct type.
    
    if (!row) {
      throw new NotFoundError(`Image with key ${key} not found`);
    }

    // Verify image still exists on disk
    if (!(await FileUtils.fileExists(row.filePath))) {
      logger.warn({ imageKey: key, filePath: row.filePath }, 'Database has stale entry for an image that no longer exists on disk. Cleaning up.');
      this.db.prepare('DELETE FROM images WHERE key = ?').run(key); // Clean up stale DB entry
      throw new NotFoundError(`Image ${key} no longer exists on disk`);
    }

    return this.rowToStoredImage(row);
  }

  async deleteFile(key: string): Promise<void> {
    // First, find all associated image files so we can delete them from disk
    const imagesToDelete = this.getImagesByOriginalKey(key);
    
    const file = await this.getFile(key); // This also confirms the file exists

    try {
      // The ON DELETE CASCADE in the DB will handle deleting image *records*.
      // We must manually delete the physical image files.
      const imageDeletePromises = imagesToDelete.map(image => FileUtils.deleteFile(image.filePath));
      await Promise.all(imageDeletePromises);

      // Now delete the physical PDF file
      await FileUtils.deleteFile(file.filePath);
      
      // Finally, delete the PDF record from the DB, which triggers the cascade
      this.db.prepare('DELETE FROM files WHERE key = ?').run(key);
      this.db.prepare('DELETE FROM pdf_processing_status WHERE key = ?').run(key);
      this.db.prepare('DELETE FROM image_processing_status WHERE key = ?').run(key);
      
      logger.info({ fileKey: key, deletedImagesCount: imagesToDelete.length }, 'Successfully deleted file and associated assets.');
    } catch (error) {
      logger.error({ err: error, fileKey: key }, `Error during deletion of file and its assets`);
      throw new AppError(`Failed to delete file ${key} and its associated assets`, 500, 'DELETE_ERROR');
    }
  }

  async deleteImage(key: string): Promise<void> {
    const image = await this.getImage(key); // Confirms image exists
    try {
      await FileUtils.deleteFile(image.filePath);
      this.db.prepare('DELETE FROM images WHERE key = ?').run(key);
      logger.info({ imageKey: key }, 'Successfully deleted image.');
    } catch (error) {
      logger.error({ err: error, imageKey: key }, `Failed to delete image`);
      throw new AppError(`Failed to delete image ${key}`, 500, 'DELETE_ERROR');
    }
  }

  async deleteImagesByOriginalKey(originalKey: string): Promise<void> {
    const imagesToDelete = this.getImagesByOriginalKey(originalKey);
    const deletePromises = imagesToDelete.map(image => this.deleteImage(image.key));
    await Promise.all(deletePromises);
    logger.info({ originalPdfKey: originalKey, deletedCount: imagesToDelete.length }, 'Deleted all images for original PDF key.');
  }

  // --- Processing Status Methods ---

  private async setStatus(table: string, key: string, status: ProcessingStatus): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO ${table} (key, status, progress, error, createdAt, completedAt)
      VALUES (@key, @status, @progress, @error, @createdAt, @completedAt)
      ON CONFLICT(key) DO UPDATE SET
        status = excluded.status,
        progress = excluded.progress,
        error = excluded.error,
        completedAt = excluded.completedAt
    `);
    stmt.run({
      key,
      status: status.status,
      progress: status.progress,
      error: status.error ? JSON.stringify(status.error) : null,
      createdAt: status.createdAt.toISOString(),
      completedAt: status.completedAt ? status.completedAt.toISOString() : null,
    });
  }

  private async getStatus(table: string, key: string): Promise<ProcessingStatus> {
    const row = this.db.prepare(`SELECT * FROM ${table} WHERE key = ?`).get(key);
    if (!row) {
      throw new NotFoundError(`Processing status for key ${key} not found`);
    }
    return this.rowToProcessingStatus(row);
  }

  async setProcessingStatus(key: string, status: ProcessingStatus): Promise<void> {
    await this.setStatus('pdf_processing_status', key, status);
  }
  
  async getProcessingStatus(key: string): Promise<ProcessingStatus> {
    return this.getStatus('pdf_processing_status', key);
  }

  async updateProcessingStatus(key: string, updates: Partial<ProcessingStatus>): Promise<ProcessingStatus> {
    const currentStatus = await this.getProcessingStatus(key);
    const updatedStatus = { ...currentStatus, ...updates };
    await this.setProcessingStatus(key, updatedStatus);
    return updatedStatus;
  }

  async setImageProcessingStatus(key: string, status: ProcessingStatus): Promise<void> {
    await this.setStatus('image_processing_status', key, status);
  }

  async getImageProcessingStatus(key: string): Promise<ProcessingStatus> {
    return this.getStatus('image_processing_status', key);
  }
  
  async updateImageProcessingStatus(key: string, updates: Partial<ProcessingStatus>): Promise<ProcessingStatus> {
    const currentStatus = await this.getImageProcessingStatus(key);
    const updatedStatus = { ...currentStatus, ...updates };
    await this.setImageProcessingStatus(key, updatedStatus);
    return updatedStatus;
  }
  
  // --- List and Helper Methods ---

  getImagesByOriginalKey(originalKey: string): StoredImage[] {
    const stmt = this.db.prepare('SELECT * FROM images WHERE originalPdfKey = ?');
    const rows = stmt.all(originalKey) as StoredImage[];
    return rows.map(this.rowToStoredImage);
  }

  listFiles(): StoredFile[] {
    const stmt = this.db.prepare('SELECT * FROM files');
    const rows = stmt.all() as StoredFile[];
    return rows.map(this.rowToStoredFile);
  }

  listImages(): StoredImage[] {
    const stmt = this.db.prepare('SELECT * FROM images');
    const rows = stmt.all() as StoredImage[];
    return rows.map(this.rowToStoredImage);
  }

  cleanup(): void {
    try {
      this.db.exec('DELETE FROM images;');
      this.db.exec('DELETE FROM files;');
      this.db.exec('DELETE FROM pdf_processing_status;');
      this.db.exec('DELETE FROM image_processing_status;');
      logger.info('Database cleanup successful.');
    } catch (error) {
      logger.error({ err: error }, "Failed to cleanup database");
    }
  }
}