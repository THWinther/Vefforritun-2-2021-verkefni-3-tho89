import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import faker from 'faker';
dotenv.config('../');

async function setup() {
  try {
    const query = fs.readFileSync('schema.sql').toString();
    const laug = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
    });

    const client = await laug.connect();
    let res = await client.query(query);
    console.log(res);

    const setupQuery = "INSERT INTO signatures(name,ssn,comment,list) VALUES($1,$2,$3,$4);";
    for(let i=0;i<500;i++){

      let lorem ='';
      if(Math.floor(Math.random()*2)==1) lorem = faker.lorem.words();

      let list = 'on';
      if(Math.floor(Math.random()*2)==1) list = '';

      let signature = [faker.name.findName(),1000000000+Math.floor(Math.random() * 9000000000),lorem,list];

      res= await client.query(setupQuery,signature);
    }

    client.release();
    await laug.end();
  } catch (e) {
    console.error(e);
  }
}

setup();
