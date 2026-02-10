const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const DATABASE_PASSWORD = process.env.DATABASE_PASSWORD || process.argv[2];

if (!DATABASE_PASSWORD) {
  console.error('Usage: node run-migrations.js <database-password>');
  console.error('Or set DATABASE_PASSWORD environment variable');
  process.exit(1);
}

// Session mode pooler connection (supports prepared statements needed for migrations)
const connectionString = `postgresql://postgres.pbdhicfcyexndqnxsyeh:${DATABASE_PASSWORD}@aws-0-eu-west-2.pooler.supabase.com:5432/postgres`;

const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations');

async function runMigrations() {
  const client = new Client({ connectionString });

  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('Connected!\n');

    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of migrationFiles) {
      console.log(`Running migration: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

      try {
        await client.query(sql);
        console.log(`  ✓ Success\n`);
      } catch (err) {
        if (err.message.includes('already exists')) {
          console.log(`  ⚠ Already exists, skipping\n`);
        } else {
          throw err;
        }
      }
    }

    console.log('All migrations completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigrations();
