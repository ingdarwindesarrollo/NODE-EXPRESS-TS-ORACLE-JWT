import OracleDB, { oracleClientVersion } from "oracledb";
import dotenv from 'dotenv';

dotenv.config();
export async function initDB(): Promise<void>{
    try{
        await OracleDB.createPool({
            user: process.env.DB_USER,
            password: process.env.DB_PASS,
            connectString: process.env.DB_CONN,
            poolMin: 1,
            poolMax: 5
        });
        console.log('Oracle conectado!');
    }catch(err){
        console.error('Error initializing database:', err);
    }
}

export async function getConnection():Promise<OracleDB.Connection>{
    return OracleDB.getConnection();
}