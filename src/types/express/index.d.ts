// This allows us to add custom properties to the Express Request object
// and have TypeScript understand them.
declare namespace Express {
  export interface Request {
    id?: string; // Optional request ID for logging and tracing
  }
}