import { v4 as uuidv4 } from 'uuid';

export interface UploadProgress {
  status: 'pending' | 'uploading' | 'completed' | 'error';
  total: number;
  loaded: number;
  percentage: number;
  error?: string;
}

export class UploadProgressService {
  private progressMap = new Map<string, UploadProgress>();
  private cleanupTimers = new Map<string, NodeJS.Timeout>();

  private setCleanupTimer(uploadId: string): void {
    // Clear any existing timer for this ID
    if (this.cleanupTimers.has(uploadId)) {
      clearTimeout(this.cleanupTimers.get(uploadId));
    }
    // Set a new timer to remove the entry after 1 hour
    const timer = setTimeout(() => {
      this.progressMap.delete(uploadId);
      this.cleanupTimers.delete(uploadId);
    }, 3600 * 1000); // 1 hour
    this.cleanupTimers.set(uploadId, timer);
  }

  initiateUpload(): string {
    const uploadId = uuidv4();
    this.progressMap.set(uploadId, {
      status: 'pending',
      total: 0,
      loaded: 0,
      percentage: 0,
    });
    this.setCleanupTimer(uploadId);
    return uploadId;
  }

  startUpload(uploadId: string, totalSize: number): void {
    if (!this.progressMap.has(uploadId)) {
      throw new Error('Upload ID not found');
    }
    this.progressMap.set(uploadId, {
      status: 'uploading',
      total: totalSize,
      loaded: 0,
      percentage: 0,
    });
    this.setCleanupTimer(uploadId);
  }

  updateProgress(uploadId: string, loadedSize: number): void {
    const progress = this.progressMap.get(uploadId);
    if (progress && progress.status === 'uploading') {
      const percentage = progress.total > 0 ? Math.round((loadedSize / progress.total) * 100) : 0;
      this.progressMap.set(uploadId, {
        ...progress,
        loaded: loadedSize,
        percentage,
      });
    }
  }

  completeUpload(uploadId: string): void {
    const progress = this.progressMap.get(uploadId);
    if (progress) {
      this.progressMap.set(uploadId, {
        ...progress,
        status: 'completed',
        loaded: progress.total,
        percentage: 100,
      });
      this.setCleanupTimer(uploadId);
    }
  }

  failUpload(uploadId: string, error: string): void {
    const progress = this.progressMap.get(uploadId);
    if (progress) {
      this.progressMap.set(uploadId, {
        ...progress,
        status: 'error',
        error,
      });
      this.setCleanupTimer(uploadId);
    }
  }

  getProgress(uploadId: string): UploadProgress | undefined {
    return this.progressMap.get(uploadId);
  }
}