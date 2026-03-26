import { Request, Response, NextFunction } from 'express';
import { verifyToken, JwtPayload } from '../utils/jwt';

export interface AuthRequest extends Request {
    user?: JwtPayload;
}

export function protect(req: AuthRequest, res: Response, next: NextFunction): void {
    const token: string | undefined = req.cookies?.access_token;

    if (!token) {
        res.status(401).json({ success: false, message: 'No autorizado: token no encontrado' });
        return;
    }

    try {
        req.user = verifyToken(token);
        next();
    } catch {
        res.status(401).json({ success: false, message: 'Token inválido o expirado' });
    }
}
