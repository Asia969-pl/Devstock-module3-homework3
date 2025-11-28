import * as dotenv from "dotenv";
dotenv.config();

import { Pool } from "pg";

export const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});


export async function testConnection() {
    try {
        const client = await pool.connect();
        await client.query('SELECT 1');  
        client.release(); 
        console.log("Połączono z bazą danych!");
    } catch (err) {
        console.error(" Błąd połączenia z bazą danych:", err);
    }
}


