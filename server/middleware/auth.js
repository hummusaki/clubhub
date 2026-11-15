// ── Express Authentication Middleware for Multi-User Endpoints ──

import { getAuthenticatedUser } from '../services/authService.js';

export async function optionalAuth(req, _res, next) {
  try {
    req.user = await getAuthenticatedUser(req);
    next();
  } catch (err) {
    next(err);
  }
}

export async function requireAuth(req, res, next) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({
        error: 'Authentication required. Please sign in with your account.',
      });
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}
