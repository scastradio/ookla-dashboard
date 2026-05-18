import { json } from '@sveltejs/kit';
import { getPool } from '$lib/db.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async ({ url }) => {
	const schema = url.searchParams.get('schema');
	const table = url.searchParams.get('table');

	try {
		const pool = getPool();

		if (schema && table) {
			const result = await pool.query(`
				SELECT column_name, data_type, is_nullable
				FROM information_schema.columns
				WHERE table_schema = $1 AND table_name = $2
				ORDER BY ordinal_position
			`, [schema, table]);
			return json({ columns: result.rows });
		}

		const result = await pool.query(`
			SELECT table_schema, table_name, table_type
			FROM information_schema.tables
			WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
			ORDER BY table_schema, table_name
		`);
		return json({ tables: result.rows });
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return json({ error: message }, { status: 500 });
	}
};
