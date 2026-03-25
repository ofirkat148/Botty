import { Request, Response, NextFunction } from 'express';
import { verifyToken, extractTokenFromHeader, TokenPayload } from '../utils/jwt.js';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
      user?: TokenPayload;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = extractTokenFromHeader(req.headers.authorization);

  if (!token) {
    return res.status(401).json({ error: 'No authorization token provided' });
  }

  try {
    const payload = verifyToken(token);
    req.userId = payload.sub;
    req.userEmail = payload.email;
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function optionalAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = extractTokenFromHeader(req.headers.authorization);

  if (token) {
    try {
      const payload = verifyToken(token);
      req.userId = payload.sub;
      req.userEmail = payload.email;
      req.user = payload;
    } catch (error) {
      // Silently ignore invalid token in optional middleware
    }
  }

  next();
}
