export interface PageRange {
  start: number;
  end?: number;
}

export interface TruncationRequest {
  pages?: number[];
  pageRange?: PageRange;
}

export interface FileKeys {
  originalKey: string;
  truncatedKey: string;
}

export interface ProcessingStatus {
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress?: number;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface StoredFile {
  key: string;
  originalName: string;
  fileName: string;
  filePath: string;
  size: number;
  mimeType: string;
  createdAt: Date;
}

export interface ApiError extends Error {
  statusCode: number;
  code: string;
}