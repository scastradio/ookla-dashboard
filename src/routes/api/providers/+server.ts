import { json } from '@sveltejs/kit';
import { getPool } from '$lib/db.js';
import { GAUSSTABLE } from '$env/static/private';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async () => {
	const table = GAUSSTABLE ?? 'ookla';
	try {
		const pool = getPool();
		const result = await pool.query(`
			SELECT isp_generated AS provider, COUNT(*)::int AS count
			FROM ${table}
			WHERE isp_generated IS NOT NULL AND isp_generated <> ''
			GROUP BY isp_generated
			ORDER BY count DESC
			LIMIT 100
		`);
		return json({ providers: result.rows });
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return json({ error: message }, { status: 500 });
	}
};
