import bcrypt from 'bcrypt';
import OracleDB from 'oracledb';
import { getConnection } from '../config/db';
import { signToken } from '../utils/jwt';

const SALT_ROUNDS = 12;

export interface RegisterDto {
    name: string;
    email: string;
    password: string;
}

export interface LoginDto {
    email: string;
    password: string;
}

export async function register(dto: RegisterDto): Promise<void> {
    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const conn = await getConnection();
    try {
        await conn.execute(
            `INSERT INTO users (name, email, password_hash) VALUES (:name, :email, :passwordHash)`,
            { name: dto.name, email: dto.email, passwordHash },
            { autoCommit: true }
        );
    } finally {
        await conn.close();
    }
}

export async function login(dto: LoginDto): Promise<string> {
    const conn = await getConnection();
    let row: [number, string, string] | undefined;
    try {
        const result = await conn.execute<[number, string, string]>(
            `SELECT id, email, password_hash FROM users WHERE email = :email`,
            { email: dto.email },
            { outFormat: OracleDB.OUT_FORMAT_ARRAY }
        );
        row = result.rows?.[0];
    } finally {
        await conn.close();
    }

    // Respuesta genérica para evitar user-enumeration
    if (!row) {
        throw Object.assign(new Error('Credenciales inválidas'), { status: 401 });
    }

    const [id, email, hash] = row;
    const valid = await bcrypt.compare(dto.password, hash);
    if (!valid) {
        throw Object.assign(new Error('Credenciales inválidas'), { status: 401 });
    }

    return signToken({ sub: id, email });
}
