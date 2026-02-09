import { Router } from 'express';
import type { Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { generateNegotiateToken, addUserToGroup } from '../services/signalr.js';

export const signalrRouter = Router();

/** POST /api/signalr/negotiate — returns SignalR Service URL + access token */
signalrRouter.post('/negotiate', authMiddleware, async (req: Request, res: Response) => {
  const user = req.user!;

  const negotiate = generateNegotiateToken(user.userId);

  // Add user to role-based groups — await to ensure groups are ready before client connects
  const groupPromises: Promise<void>[] = [
    addUserToGroup(user.userId, `user-${user.userId}`),
  ];

  if (user.role === 'admin') {
    groupPromises.push(addUserToGroup(user.userId, 'admin'));
  }

  if (user.vendorId) {
    groupPromises.push(addUserToGroup(user.userId, `vendor-${user.vendorId}`));
  }

  await Promise.allSettled(groupPromises);

  res.json(negotiate);
});
