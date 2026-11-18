// Adds userId to Express's Request type. requireAuth sets it after checking the cookie.
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export {};
