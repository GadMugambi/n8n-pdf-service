import { StoredFile, ProcessingStatus } from '../types';
import { FileUtils } from '../utils/fileUtils';
import { NotFoundError, AppError } from '../utils/errors';

export class StorageService {
  private files = new Map<string, StoredFile>();
  private processingStatus = new Map<string, ProcessingStatus>();

  async storeFile(
    key: string,
    originalName: string,
    fileName: string,
    filePath: string,
    size: number,
    mimeType: string
  ): Promise<StoredFile> {
    const file: StoredFile = {
      key,
      originalName,
      fileName,
      filePath,
      size,
      mimeType,
      createdAt: new Date()
    };

    this.files.set(key, file);
    return file;
  }

  async getFile(key: string): Promise<StoredFile> {
    const file = this.files.get(key);
    if (!file) {
      throw new NotFoundError(`File with key ${key} not found`);
    }

    // Verify file still exists on disk
    if (!(await FileUtils.fileExists(file.filePath))) {
      this.files.delete(key);
      throw new NotFoundError(`File ${key} no longer exists on disk`);
    }

    return file;
  }

  async deleteFile(key: string): Promise<void> {
    const file = this.files.get(key);
    if (!file) {
      throw new NotFoundError(`File with key ${key} not found`);
    }

    try {
      await FileUtils.deleteFile(file.filePath);
      this.files.delete(key);
      this.processingStatus.delete(key);
    } catch (error) {
      throw new AppError(`Failed to delete file ${key}`, 500, 'DELETE_ERROR');
    }
  }

  async setProcessingStatus(key: string, status: ProcessingStatus): Promise<void> {
    this.processingStatus.set(key, status);
  }

  async getProcessingStatus(key: string): Promise<ProcessingStatus> {
    const status = this.processingStatus.get(key);
    if (!status) {
      throw new NotFoundError(`Processing status for key ${key} not found`);
    }
    return status;
  }

  async updateProcessingStatus(
    key: string, 
    updates: Partial<ProcessingStatus>
  ): Promise<ProcessingStatus> {
    const currentStatus = await this.getProcessingStatus(key);
    const updatedStatus = { ...currentStatus, ...updates };
    this.processingStatus.set(key, updatedStatus);
    return updatedStatus;
  }

  listFiles(): StoredFile[] {
    return Array.from(this.files.values());
  }

  cleanup(): void {
    this.files.clear();
    this.processingStatus.clear();
  }
}