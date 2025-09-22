import Database from 'better-sqlite3';
import { FileUtils } from '../utils/fileUtils';
import { config } from '../config';

export class DatabaseService {
  public readonly db: Database.Database;

  constructor(dbPath: string) {
    // Ensure the directory for the database exists before connecting
    FileUtils.ensureDirectoryExists(config.dbDir);
    
    this.db = new Database(dbPath, { verbose: console.log });
    console.log(`🗄️  Database connected at ${dbPath}`);
  }

  public init(): void {
    console.log('Initializing database schema...');
    
    // For better concurrency and performance
    this.db.pragma('journal_mode = WAL');

    // Create a table for stored files (original PDFs and truncated PDFs)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS files (
        key TEXT PRIMARY KEY NOT NULL,
        originalName TEXT NOT NULL,
        fileName TEXT NOT NULL,
        filePath TEXT NOT NULL,
        size INTEGER NOT NULL,
        mimeType TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );
    `);

    // Create a table for generated images
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS images (
        key TEXT PRIMARY KEY NOT NULL,
        originalPdfKey TEXT NOT NULL,
        originalName TEXT NOT NULL,
        fileName TEXT NOT NULL,
        filePath TEXT NOT NULL,
        size INTEGER NOT NULL,
        mimeType TEXT NOT NULL,
        pageNumber INTEGER NOT NULL,
        format TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        FOREIGN KEY (originalPdfKey) REFERENCES files (key) ON DELETE CASCADE
      );
    `);
    // ON DELETE CASCADE ensures that if a PDF is deleted from the 'files' table,
    // all its associated images are automatically deleted from this 'images' table.

    // Create tables for processing statuses to avoid conflicts
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pdf_processing_status (
        key TEXT PRIMARY KEY NOT NULL,
        status TEXT NOT NULL,
        progress INTEGER,
        error TEXT,
        createdAt TEXT NOT NULL,
        completedAt TEXT
      );
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS image_processing_status (
        key TEXT PRIMARY KEY NOT NULL,
        status TEXT NOT NULL,
        progress INTEGER,
        error TEXT,
        createdAt TEXT NOT NULL,
        completedAt TEXT
      );
    `);
    
    console.log('Database schema initialized successfully.');
  }
}