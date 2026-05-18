import { json } from '@sveltejs/kit';
import { getPool } from '$lib/db.js';
import { GAUSSTABLE } from '$env/static/private';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async ({ url }) => {
	const table = GAUSSTABLE ?? 'ookla';
	const metric = url.searchParams.get('metric') ?? 'dl_speed_mbps';
	const date = url.searchParams.get('date') ?? null;
	const provider = url.searchParams.get('provider') ?? null;

	const allowed = new Set(['dl_speed_mbps', 'ul_speed_mbps', 'ave_latency_ms']);
	if (!allowed.has(metric)) {
		return json({ error: 'Invalid metric' }, { status: 400 });
	}

	const conditions: string[] = [
		`client_latitude IS NOT NULL`,
		`client_longitude IS NOT NULL`,
		`client_latitude <> ''`,
		`client_longitude <> ''`
	];
	const params: string[] = [];

	if (date) {
		params.push(date);
		conditions.push(`test_date = $${params.length}`);
	}

	if (provider && provider !== 'all') {
		params.push(`%${provider}%`);
		conditions.push(`isp_generated ILIKE $${params.length}`);
	}

	const where = conditions.join(' AND ');

	const query = `
		SELECT
			COALESCE(geo_area, 'Unknown') AS area,
			AVG(client_latitude::float)   AS lat,
			AVG(client_longitude::float)  AS lng,
			AVG(${metric}::float)         AS value,
			COUNT(*)::int                 AS count
		FROM ${table}
		WHERE ${where}
		GROUP BY geo_area
		HAVING AVG(${metric}::float) IS NOT NULL
		ORDER BY count DESC
		LIMIT 800
	`;

	try {
		const pool = getPool();
		const result = await pool.query(query, params);
		return json({ points: result.rows });
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return json({ error: message }, { status: 500 });
	}
};
