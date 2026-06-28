import type { Request, Response, NextFunction } from 'express';
import { success } from '../../shared/utils/response.utils';
import * as authService from './auth.service';

export async function login(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email, password } = req.body as { email: string; password: string };
    const result = await authService.login(email, password);
    success(
      res,
      {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: result.user,
      },
      'Logged in',
    );
  } catch (err) {
    next(err);
  }
}

export async function refresh(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { refreshToken } = req.body as { refreshToken: string };
    const result = await authService.refresh(refreshToken);
    success(
      res,
      {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      },
      'Token refreshed',
    );
  } catch (err) {
    next(err);
  }
}

export async function logout(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const refreshToken = (req.body as { refreshToken?: string }).refreshToken;
    await authService.logout(
      typeof refreshToken === 'string' ? refreshToken : undefined,
    );
    success(res, null, 'Logged out');
  } catch (err) {
    next(err);
  }
}

export async function me(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = await authService.getMe(req.user!.userId);
    success(res, user);
  } catch (err) {
    next(err);
  }
}
