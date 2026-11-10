#!/usr/bin/env node
const { Client } = require('pg');

async function run() {
  const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@db:5432/nimbus';
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  // Insert a sample installation and saved location if not exists
  try {
    const res = await client.query("SELECT id FROM installations LIMIT 1");
    if (res.rows.length === 0) {
      const installRes = await client.query(
        "INSERT INTO installations (device_id, platform, language) VALUES ($1, $2, $3) RETURNING id",
        ['local-dev-device', 'web', 'en']
      );
      const installationId = installRes.rows[0].id;
      await client.query(
        `INSERT INTO saved_locations (installation_id, name, region, country, timezone, latitude, longitude, is_favorite)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [installationId, 'San Francisco', 'CA', 'US', 'America/Los_Angeles', 37.7749, -122.4194, true]
      );
      console.log('Seeded sample installation and location');
    } else {
      console.log('Installation exists, skipping seed');
    }
  } catch (err) {
    console.error('Seed error', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
