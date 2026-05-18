import { json } from '@sveltejs/kit';
import { getPool } from '$lib/db.js';
import { GAUSSTABLE, GAUSSSCHEMA } from '$env/static/private';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async ({ url }) => {
	const schema = GAUSSSCHEMA ?? '';
	const tbl = GAUSSTABLE ?? 'ookla';
	const table = schema ? `${schema}.${tbl}` : tbl;

	const metric = url.searchParams.get('metric') ?? 'dl_speed_mbps';
	const date = url.searchParams.get('date') ?? null;

	const allowed = new Set(['dl_speed_mbps', 'ul_speed_mbps', 'ave_latency_ms']);
	if (!allowed.has(metric)) return json({ error: 'Invalid metric' }, { status: 400 });

	const conditions = [
		`client_latitude IS NOT NULL`,
		`client_longitude IS NOT NULL`,
		`LENGTH(client_latitude) > 0`,
		`LENGTH(client_longitude) > 0`,
		`isp_generated IS NOT NULL`,
		`LENGTH(isp_generated) > 0`
	];
	const params: string[] = [];

	if (date) {
		params.push(date);
		conditions.push(`LEFT(test_date, 10) = $${params.length}`);
	}

	// Same conditions but fully qualified with table alias for the outer JOIN query
	const tConds = conditions.map(c => c.replace(/\b(client_latitude|client_longitude|isp_generated|test_date|geo_area)\b/g, 't.$1'));

	const query = `
		WITH provider_counts AS (
			SELECT isp_generated, COUNT(*) AS n
			FROM ${table}
			WHERE ${conditions.join(' AND ')}
			GROUP BY isp_generated
			HAVING COUNT(*) >= 5
			ORDER BY n DESC
			LIMIT 30
		)
		SELECT
			COALESCE(t.geo_area, 'Unknown')   AS area,
			t.isp_generated                   AS provider,
			AVG(t.client_latitude::float)     AS lat,
			AVG(t.client_longitude::float)    AS lng,
			AVG(t.${metric}::float)           AS value,
			COUNT(*)                          AS test_count
		FROM ${table} t
		INNER JOIN provider_counts pc ON t.isp_generated = pc.isp_generated
		WHERE ${tConds.join(' AND ')}
		GROUP BY t.geo_area, t.isp_generated
		HAVING AVG(t.${metric}::float) IS NOT NULL
		ORDER BY area, value DESC
	`;

	try {
		const pool = getPool();
		const result = await pool.query(query, params);
		return json({
			points: result.rows.map(r => ({
				area: r.area,
				provider: r.provider,
				lat: Number(r.lat),
				lng: Number(r.lng),
				value: Number(r.value),
				count: Number(r.test_count)
			}))
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return json({ error: message }, { status: 500 });
	}
};
