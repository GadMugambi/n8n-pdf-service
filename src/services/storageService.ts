import { StoredFile, StoredImage, ProcessingStatus } from '../types';
import { FileUtils } from '../utils/fileUtils';
import { NotFoundError, AppError } from '../utils/errors';

export class StorageService {
  private files = new Map<string, StoredFile>();
  private images = new Map<string, StoredImage>();
  private processingStatus = new Map<string, ProcessingStatus>();
  private imageProcessingStatus = new Map<string, ProcessingStatus>();

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

  async storeImage(key: string, image: StoredImage): Promise<StoredImage> {
    this.images.set(key, image);
    return image;
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

  async getImage(key: string): Promise<StoredImage> {
    const image = this.images.get(key);
    if (!image) {
      throw new NotFoundError(`Image with key ${key} not found`);
    }

    // Verify image still exists on disk
    if (!(await FileUtils.fileExists(image.filePath))) {
      this.images.delete(key);
      throw new NotFoundError(`Image ${key} no longer exists on disk`);
    }

    return image;
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
      this.imageProcessingStatus.delete(key);
    } catch (error) {
      throw new AppError(`Failed to delete file ${key}`, 500, 'DELETE_ERROR');
    }
  }

  async deleteImage(key: string): Promise<void> {
    const image = this.images.get(key);
    if (!image) {
      throw new NotFoundError(`Image with key ${key} not found`);
    }

    try {
      await FileUtils.deleteFile(image.filePath);
      this.images.delete(key);
    } catch (error) {
      throw new AppError(`Failed to delete image ${key}`, 500, 'DELETE_ERROR');
    }
  }

  async deleteImagesByOriginalKey(originalKey: string): Promise<void> {
    const imagesToDelete = Array.from(this.images.values()).filter(
      image => image.originalName.includes(originalKey) || 
      image.fileName.includes(originalKey)
    );

    const deletePromises = imagesToDelete.map(async (image) => {
      try {
        await FileUtils.deleteFile(image.filePath);
        this.images.delete(image.key);
      } catch (error) {
        console.error(`Failed to delete image ${image.key}:`, error);
      }
    });

    await Promise.all(deletePromises);
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

  async setImageProcessingStatus(key: string, status: ProcessingStatus): Promise<void> {
    this.imageProcessingStatus.set(key, status);
  }

  async getImageProcessingStatus(key: string): Promise<ProcessingStatus> {
    const status = this.imageProcessingStatus.get(key);
    if (!status) {
      throw new NotFoundError(`Image processing status for key ${key} not found`);
    }
    return status;
  }

  async updateImageProcessingStatus(
    key: string, 
    updates: Partial<ProcessingStatus>
  ): Promise<ProcessingStatus> {
    const currentStatus = await this.getImageProcessingStatus(key);
    const updatedStatus = { ...currentStatus, ...updates };
    this.imageProcessingStatus.set(key, updatedStatus);
    return updatedStatus;
  }

  getImagesByOriginalKey(originalKey: string): StoredImage[] {
    return Array.from(this.images.values()).filter(
      image => image.originalName.includes(originalKey) || 
      image.fileName.includes(originalKey)
    );
  }

  listFiles(): StoredFile[] {
    return Array.from(this.files.values());
  }

  listImages(): StoredImage[] {
    return Array.from(this.images.values());
  }

  cleanup(): void {
    this.files.clear();
    this.images.clear();
    this.processingStatus.clear();
    this.imageProcessingStatus.clear();
  }
}