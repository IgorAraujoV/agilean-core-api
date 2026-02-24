import { buildApp } from './app';

const app = buildApp({ dbPath: './data/agilean.db' });

app.listen({ port: 3000, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Server running at ${address}`);
});
