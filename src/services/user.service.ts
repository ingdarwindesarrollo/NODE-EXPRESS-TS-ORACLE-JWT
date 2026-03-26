import { getConnection } from '../config/db';
export interface User{
    id?: number;
    name: string;
    email: string;
}
export async function getAll(): Promise<unknown[]>{
    const conn = await getConnection();
    const result = await conn.execute('SELECT * FROM users');
    await conn.close();
    return result.rows ?? [];
}
export async function getById(id: number): Promise<unknown>{
    const conn = await getConnection();
    const result = await conn.execute(
        `Select * from users WHERE id = :id`,
        {id}
    );
    await conn.close();
    return result.rows?.[0];
}
export async function create(user: User): Promise<void>{
    const conn = await getConnection();
    const result = await conn.execute(
        `INSERT INTO users (name,email) VALUES (:name, :email)`,
        user as unknown as Record<string, string | number | undefined>,
        { autoCommit: true }
    );
    await conn.close();
}

export async function update(id: number, user:Partial<User>):Promise<void>{
    const conn = await getConnection();
    const result = await conn.execute(`UPDATE users SET name = :name, email = :email WHERE  id = :id`,
    {...user, id} as Record<string, string | number | undefined>,
    { autoCommit: true }
    );
    await conn.close();
}

export async function remove(id: number):Promise<void>{
    const conn = await getConnection();
    const result = await conn.execute(`DELETE FROM users WHERE id = :id`,
        { id },
        { autoCommit: true }
    );
    await conn.close();
}