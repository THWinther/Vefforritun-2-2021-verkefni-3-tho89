import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

async function setup() {
  try {
    const query = fs.readFileSync('schema.sql').toString();
    const laug = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
    });

    const client = await laug.connect();
    const res = await client.query(query);
    console.log(res);

    client.release();
    await laug.end();
  } catch (e) {
    console.error(e);
  }
}

setup();
