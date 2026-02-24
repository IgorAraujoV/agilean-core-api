/**
 * Script E2E — smoke test do fluxo completo via HTTP.
 * Requer servidor rodando: npm run dev
 * Executar: npm run e2e
 */
const BASE = 'http://localhost:3000';

async function post(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}: ${await res.text()}`);
  return res.json() as Promise<Record<string, unknown>>;
}

async function get(path: string) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json() as Promise<unknown>;
}

async function main() {
  console.log('=== E2E: Criando projeto ===');

  const building = await post('/buildings', { name: 'Projeto E2E', firstDate: '2024-01-01' });
  const bid = building['id'] as string;
  console.log(`Building: ${bid}`);

  const diagram = await post(`/buildings/${bid}/diagrams`, { name: 'Diagrama E2E' });
  const did = diagram['id'] as string;
  const network = await post(`/buildings/${bid}/diagrams/${did}/networks`, { name: 'Rede' });
  const nid = (network as Record<string, unknown>)['id'] as string;

  const s1 = await post(`/buildings/${bid}/diagrams/${did}/networks/${nid}/stages`,
    { name: 'Fundação', duration: 5, latency: 0 });
  const s2 = await post(`/buildings/${bid}/diagrams/${did}/networks/${nid}/stages`,
    { name: 'Estrutura', duration: 8, latency: 0 });
  const s3 = await post(`/buildings/${bid}/diagrams/${did}/networks/${nid}/stages`,
    { name: 'Acabamento', duration: 3, latency: 0 });

  await post(`/buildings/${bid}/diagrams/${did}/precedences`,
    { sourceStageId: s1['id'], destinationStageId: s2['id'], opening: 1, latency: 0 });
  await post(`/buildings/${bid}/diagrams/${did}/precedences`,
    { sourceStageId: s2['id'], destinationStageId: s3['id'], opening: 1, latency: 0 });

  const unit = await post(`/buildings/${bid}/typologies`, { name: 'Bloco A' });
  for (let i = 1; i <= 5; i++) {
    await post(`/buildings/${bid}/typologies`, { name: `Piso ${i}`, parentId: unit['id'] });
  }

  const line = await post(`/buildings/${bid}/lines`, { networkId: nid, placeId: unit['id'] });
  console.log(`Line criada: ${line['id']} | packages: ${line['packageCount']}`);

  const packages = await get(`/buildings/${bid}/lines/${line['id']}/packages`) as Array<{
    id: string; stageId: string; startCol: number; endCol: number;
  }>;
  const firstPkg = packages.find(p => p.stageId === s1['id'] as string)!;
  console.log(`Primeiro pacote: ${firstPkg.id} | cols: ${firstPkg.startCol}–${firstPkg.endCol}`);

  const targetColumn = firstPkg.startCol + 3;
  const t0 = Date.now();
  const moveResult = await post(`/buildings/${bid}/packages/${firstPkg.id}/move`,
    { column: targetColumn }) as { movedCount: number; packages: Array<{id:string;startCol:number;endCol:number}> };
  const elapsed = Date.now() - t0;

  console.log(`\n=== Resultado ===`);
  console.log(`Pacotes movidos: ${moveResult.movedCount}`);
  console.log(`Tempo (HTTP round-trip): ${elapsed}ms`);
  for (const p of moveResult.packages.slice(0, 5)) {
    console.log(`  ${p.id.slice(0, 8)}: col ${p.startCol}–${p.endCol}`);
  }
  if (moveResult.packages.length > 5) {
    console.log(`  ... e mais ${moveResult.packages.length - 5} pacotes`);
  }
  console.log('\nE2E completo!');
}

main().catch(err => {
  console.error('E2E falhou:', err.message);
  process.exit(1);
});
