import { Request, Response, NextFunction } from 'express';
import * as service from '../services/auth.service';
import { AuthRequest } from '../middlewares/auth.middleware';

const COOKIE_NAME = 'access_token';
const isProd = process.env.NODE_ENV === 'production';

const cookieOptions = {
    httpOnly: true,          // inaccessible desde JavaScript del navegador
    secure: isProd,          // solo HTTPS en producción
    sameSite: 'strict' as const, // protección contra CSRF
    maxAge: 15 * 60 * 1000, // 15 minutos en ms
    path: '/',
};

export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        await service.register(req.body);
        res.status(201).json({ success: true, message: 'Usuario registrado correctamente' });
    } catch (err) {
        next(err);
    }
};

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const token = await service.login(req.body);
        res.cookie(COOKIE_NAME, token, cookieOptions);
        res.json({ success: true, message: 'Login exitoso' });
    } catch (err) {
        next(err);
    }
};

export const logout = (_req: Request, res: Response): void => {
    res.clearCookie(COOKIE_NAME, {
        httpOnly: true,
        secure: isProd,
        sameSite: 'strict',
        path: '/',
    });
    res.json({ success: true, message: 'Sesión cerrada correctamente' });
};

export const me = (req: AuthRequest, res: Response): void => {
    res.json({ success: true, user: req.user });
};
