import { getConnection } from "../config/db";
export interface Product {
    id?: number;
    name: string;
    price: number;
}

export async function getAll(): Promise<unknown[]>{
    const conn = await getConnection();
    const result = await conn.execute("SELECT * FROM products");
    await conn.close();
    return result.rows ?? [];
}

export async function getById(id: number): Promise<unknown>{
    const conn = await getConnection();
    const result = await conn.execute("SELECT * FROM products WHERE id = :id", { id });
    await conn.close();
    return result.rows?.[0] ?? null;
}

export async function create(product: Product): Promise<void> {
    const conn = await getConnection();
    await conn.execute(`INSERT INTO products (name, price) VALUES (:name, :price)`, 
        product as unknown as Record<string, string | number | undefined>,
        { autoCommit: true }
    );
    await conn.close();
}

export async function update(id: number, product: Partial<Product>): Promise<void> {
    const conn = await getConnection();
    await conn.execute(
        `UPDATE products SET name = :name, price = :price WHERE id = :id`, 
        { ...product, id } as unknown as Record<string, string | number | undefined>,
        { autoCommit: true }
    );
    await conn.close();
}

export async function remove(id: number): Promise<void> {
    const conn = await getConnection();
    await conn.execute(`DELETE FROM products WHERE id = :id`, { id }, { autoCommit: true });
    await conn.close();
}