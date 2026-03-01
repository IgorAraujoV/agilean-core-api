// Quick test: import real bs-jade.agl via Fastify inject
const fs = require('fs');
const path = require('path');

async function main() {
  // Load the real AGL
  const aglPath = path.resolve(__dirname, '..', 'bs-jade.agl');
  if (!fs.existsSync(aglPath)) {
    console.error('bs-jade.agl not found at:', aglPath);
    process.exit(1);
  }
  const agl = JSON.parse(fs.readFileSync(aglPath, 'utf-8'));
  console.log('Loaded AGL, size:', JSON.stringify(agl).length, 'bytes');

  // Build the app
  const { buildApp } = require('./dist/app');
  const app = buildApp();
  await app.ready();

  // Register/login to get token
  const regRes = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email: 'test-import@test.com', password: 'test123456' },
  });
  let token;
  if (regRes.statusCode === 201) {
    token = regRes.json().token;
  } else {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'master@master.com', password: '12345' },
    });
    token = loginRes.json().token;
  }

  console.log('Got auth token');

  // Import
  console.time('import');
  const importRes = await app.inject({
    method: 'POST',
    url: '/buildings/import',
    headers: { authorization: `Bearer ${token}` },
    payload: agl,
  });
  console.timeEnd('import');

  console.log('Status:', importRes.statusCode);
  if (importRes.statusCode !== 201) {
    console.error('FAILED:', importRes.json());
    process.exit(1);
  }

  const building = importRes.json();
  console.log('Imported building:', JSON.stringify(building, null, 2));

  // Verify some counts
  const diagRes = await app.inject({
    method: 'GET',
    url: `/buildings/${building.id}/diagrams`,
    headers: { authorization: `Bearer ${token}` },
  });
  console.log('Diagrams:', diagRes.json().length);

  const linesRes = await app.inject({
    method: 'GET',
    url: `/buildings/${building.id}/lines`,
    headers: { authorization: `Bearer ${token}` },
  });
  console.log('Lines:', linesRes.json().length);

  console.log('\nSUCCESS: Import completed without FK errors!');
  await app.close();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
