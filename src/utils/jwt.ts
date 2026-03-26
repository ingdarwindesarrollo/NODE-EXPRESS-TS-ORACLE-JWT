import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET as string;
const EXPIRES_IN = (process.env.JWT_EXPIRES_IN ?? '15m') as string;

export interface JwtPayload {
    sub: number;   // user id
    email: string;
    iat?: number;
    exp?: number;
}

export function signToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
    if (!SECRET) throw new Error('JWT_SECRET no está definido en las variables de entorno');
    return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload {
    if (!SECRET) throw new Error('JWT_SECRET no está definido en las variables de entorno');
    return jwt.verify(token, SECRET) as unknown as JwtPayload;
}
