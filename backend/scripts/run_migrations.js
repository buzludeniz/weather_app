#!/usr/bin/env node
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function run() {
  const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@db:5432/nimbus';
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  const migrationsDir = path.join(__dirname, '..', 'src', 'db', 'migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    console.log('Applying', file);
    try {
      await client.query(sql);
      console.log('Applied', file);
    } catch (err) {
      console.error('Failed to apply', file, err.message);
      await client.end();
      process.exit(1);
    }
  }
  await client.end();
  console.log('Migrations complete');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
