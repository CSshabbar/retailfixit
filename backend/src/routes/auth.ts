import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { config } from '../config.js';
import { findUserByEmail, listTechnicians, listVendors } from '../services/usersDb.js';
import { authMiddleware } from '../middleware/auth.js';
import { rbacMiddleware } from '../middleware/rbac.js';
import type { JwtPayload } from '../types/auth.js';

/** Authentication router — provides login + user lookup endpoints */
export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Email and password are required' },
    });
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid email format' },
    });
    return;
  }

  const user = await findUserByEmail(email);

  if (!user) {
    res.status(401).json({
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
    });
    return;
  }

  const passwordValid = await bcrypt.compare(password, user.passwordHash);

  if (!passwordValid) {
    res.status(401).json({
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
    });
    return;
  }

  const payload: JwtPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    vendorId: user.vendorId,
  };

  const token = jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'],
  });

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      vendorId: user.vendorId,
      displayName: user.displayName,
    },
  });
});

/** GET /vendors — returns unique vendors (admin only) */
authRouter.get(
  '/vendors',
  authMiddleware,
  rbacMiddleware(['admin']),
  async (_req, res) => {
    const vendors = await listVendors();
    res.json({ data: vendors });
  },
);

/** GET /technicians — returns technicians visible to the current user */
authRouter.get(
  '/technicians',
  authMiddleware,
  rbacMiddleware(['admin', 'dispatcher']),
  async (req, res) => {
    const user = req.user!;
    // Dispatchers see own vendor; admins can optionally filter by vendorId query param
    let vendorId: string | undefined;
    if (user.role === 'dispatcher') {
      vendorId = user.vendorId ?? undefined;
    } else if (req.query.vendorId) {
      vendorId = req.query.vendorId as string;
    }
    const technicians = await listTechnicians(vendorId);
    res.json({ data: technicians });
  },
);
