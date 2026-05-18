import { json } from '@sveltejs/kit';
import { getPool } from '$lib/db.js';
import { GAUSSTABLE } from '$env/static/private';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async () => {
	const table = GAUSSTABLE ?? 'ookla';
	try {
		const pool = getPool();
		const result = await pool.query(
			`SELECT MIN(test_date) AS min_date, MAX(test_date) AS max_date FROM ${table}`
		);
		return json(result.rows[0]);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return json({ error: message }, { status: 500 });
	}
};
