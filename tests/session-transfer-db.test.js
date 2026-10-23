import { expect, test } from 'bun:test';

// Runs real RPC/trigger rules in rolled-back transactions, never on live bills.
const databaseTest = process.env.PGHOST && process.env.TRANSFER_TEST_USER_ID ? test : test.skip;
const session = { startAt: 1792737070066, rate: 115000, paidAmount: 115000, payments: [{ amount: 115000, at: 1792737070066 }], orders: [{ id: 'meal', qty: 4 }] };
const sqlJson = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const source = { id: 'transfer-source', name: 'Transfer test A', session };
const empty = { id: 'transfer-target', name: 'Transfer test B', session: null };
const intent = (payload, base, tx = 'move') => ({ kind: 'station', entity_id: payload.id, payload, base, transaction: tx, deleted: false });
const forward = [intent({ ...source, session: null }, source), intent({ ...empty, session }, empty)];
const reverse = [intent(source, { ...source, session: null }, 'return'), intent(empty, { ...empty, session }, 'return')];

async function checkSQL(body) {
  const uid = process.env.TRANSFER_TEST_USER_ID;
  if (!uid || !/^[a-f0-9-]{36}$/i.test(uid)) throw new Error('Missing test identity');
  const storeQuery = Bun.spawn(['psql', '--no-psqlrc', '--quiet', '-Atc', `select store_id from public.store_members where user_id='${uid}' limit 1`], { stdout: 'pipe', stderr: 'pipe' });
  const storeId = (await new Response(storeQuery.stdout).text()).trim();
  if (await storeQuery.exited !== 0 || !/^[a-f0-9-]{36}$/i.test(storeId)) throw new Error('Test store unavailable');
  const script = `BEGIN;
    INSERT INTO public.store_data(store_id,kind,entity_id,payload,retired_session_before) VALUES
      ('00000000-0000-4000-8000-000000000061','station','transfer-source',${sqlJson(source)},0),
      ('00000000-0000-4000-8000-000000000061','station','transfer-target',${sqlJson(empty)},1792738000000);
    SELECT set_config('request.jwt.claim.sub','${uid}',true);
    SELECT set_config('request.jwt.claim.role','authenticated',true);
    SET LOCAL ROLE authenticated;
    DO $$ DECLARE result jsonb; rejected boolean := false; BEGIN ${body} END $$;
    ROLLBACK;`.replaceAll('00000000-0000-4000-8000-000000000061', storeId);
  const proc = Bun.spawn(['psql', '--no-psqlrc', '--quiet', '--set', 'ON_ERROR_STOP=1'], {
    env: process.env,
    stdin: new Blob([script]), stdout: 'pipe', stderr: 'pipe',
  });
  const [code, errors] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
  expect(errors).toBe('');
  expect(code).toBe(0);
}
const call = rows => `public.store_apply_intents('00000000-0000-4000-8000-000000000061',${sqlJson(rows)})`;

databaseTest('active paid session transfers and returns despite destination retirement watermark', async () => {
  await checkSQL(`
    result := ${call(forward)};
    IF result->>'accepted' <> 'true' THEN RAISE EXCEPTION 'forward rejected'; END IF;
    IF (SELECT payload->'session' FROM public.store_data WHERE store_id='00000000-0000-4000-8000-000000000061' AND entity_id='transfer-target') IS DISTINCT FROM ${sqlJson(session)} THEN RAISE EXCEPTION 'timer or payment changed'; END IF;
    result := ${call(reverse)};
    IF result->>'accepted' <> 'true' THEN RAISE EXCEPTION 'return rejected'; END IF;
    IF (SELECT payload->'session' FROM public.store_data WHERE store_id='00000000-0000-4000-8000-000000000061' AND entity_id='transfer-source') IS DISTINCT FROM ${sqlJson(session)} THEN RAISE EXCEPTION 'return changed session'; END IF;
  `);
}, 15000);

databaseTest('completed or VOID session cannot be replayed', async () => {
  await checkSQL(`
    result := ${call([forward[0]])};
    IF result->>'accepted' <> 'true' THEN RAISE EXCEPTION 'close rejected'; END IF;
    BEGIN result := ${call([reverse[0]])}; EXCEPTION WHEN SQLSTATE 'P0001' THEN rejected := true; END;
    IF NOT rejected THEN RAISE EXCEPTION 'retired session resurrected'; END IF;
  `);
}, 15000);

databaseTest('stale move rejects source and destination atomically', async () => {
  const stale = [{ ...forward[0], base: { ...source, name: 'Stale source' } }, forward[1]];
  await checkSQL(`
    result := ${call(stale)};
    IF result->>'accepted' <> 'false' THEN RAISE EXCEPTION 'stale move accepted'; END IF;
    IF (SELECT payload FROM public.store_data WHERE store_id='00000000-0000-4000-8000-000000000061' AND entity_id='transfer-source') IS DISTINCT FROM ${sqlJson(source)} THEN RAISE EXCEPTION 'source partially changed'; END IF;
    IF (SELECT payload FROM public.store_data WHERE store_id='00000000-0000-4000-8000-000000000061' AND entity_id='transfer-target') IS DISTINCT FROM ${sqlJson(empty)} THEN RAISE EXCEPTION 'destination partially changed'; END IF;
  `);
}, 15000);

databaseTest('unrelated transactions cannot bypass retired-session protection', async () => {
  await checkSQL(`
    BEGIN result := ${call([forward[0], { ...forward[1], transaction: 'unrelated' }])}; EXCEPTION WHEN SQLSTATE 'P0001' THEN rejected := true; END;
    IF NOT rejected THEN RAISE EXCEPTION 'unlinked transfer bypassed retirement'; END IF;
    IF (SELECT payload FROM public.store_data WHERE store_id='00000000-0000-4000-8000-000000000061' AND entity_id='transfer-source') IS DISTINCT FROM ${sqlJson(source)} THEN RAISE EXCEPTION 'source partially changed'; END IF;
  `);
}, 15000);

databaseTest('verified transfer is independent of source/destination write order', async () => {
  await checkSQL(`result := ${call([...forward].reverse())}; IF result->>'accepted' <> 'true' THEN RAISE EXCEPTION 'destination-first move rejected'; END IF;`);
}, 15000);

databaseTest('fabricated live source cannot authorize replay', async () => {
  const fake = { ...source, id: 'fake-source' };
  await checkSQL(`
    result := ${call([intent({ ...fake, session: null }, fake), forward[1]])};
    IF result->>'accepted' <> 'false' THEN RAISE EXCEPTION 'fake source accepted'; END IF;
  `);
}, 15000);