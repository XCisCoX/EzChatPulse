export {};

declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth middleware after JWT verification. */
      userId: number;
    }
  }
}
