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
		const result = await pool.query(`
			SELECT isp_generated AS provider, COUNT(*) AS test_count
			FROM ${table}
			WHERE isp_generated IS NOT NULL AND LENGTH(isp_generated) > 0
			GROUP BY isp_generated
			ORDER BY test_count DESC
			LIMIT 100
		`);
		return json({ providers: result.rows.map(r => ({ provider: r.provider, count: Number(r.test_count) })) });
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return json({ error: message }, { status: 500 });
	}
};
