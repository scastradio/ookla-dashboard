import { json } from '@sveltejs/kit';
import { getPool } from '$lib/db.js';
import { GAUSSTABLE, GAUSSSCHEMA } from '$env/static/private';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async () => {
	const schema = GAUSSSCHEMA ?? '';
	const tbl = GAUSSTABLE ?? 'ookla';
	const table = schema ? `${schema}.${tbl}` : tbl;
	try {
		const pool = getPool();
		const result = await pool.query(
			`SELECT LEFT(MIN(test_date), 10) AS min_date, LEFT(MAX(test_date), 10) AS max_date FROM ${table}`
		);
		return json(result.rows[0]);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return json({ error: message }, { status: 500 });
	}
};
