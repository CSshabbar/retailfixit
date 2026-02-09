import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { UserRole } from '../types/auth.js';

/** Returns middleware that restricts access to the specified roles */
export function rbacMiddleware(allowedRoles: UserRole[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: { code: 'TOKEN_MISSING', message: 'Authentication required' },
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Insufficient permissions' },
      });
      return;
    }

    next();
  };
}
