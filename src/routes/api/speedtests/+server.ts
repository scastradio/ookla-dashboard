import { json } from '@sveltejs/kit';
import { getPool } from '$lib/db.js';
import { GAUSSTABLE, GAUSSSCHEMA } from '$env/static/private';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async ({ url }) => {
	const schema = GAUSSSCHEMA ?? '';
	const tbl = GAUSSTABLE ?? 'ookla';
	const table = schema ? `${schema}.${tbl}` : tbl;

	const metric = url.searchParams.get('metric') ?? 'dl_speed_mbps';
	const from = url.searchParams.get('from') ?? null;
	const to = url.searchParams.get('to') ?? null;
	const provider = url.searchParams.get('provider') ?? null;
	const aggregate = url.searchParams.get('aggregate') === 'true';

	const allowed = new Set(['dl_speed_mbps', 'ul_speed_mbps', 'ave_latency_ms']);
	if (!allowed.has(metric)) return json({ error: 'Invalid metric' }, { status: 400 });

	const conditions: string[] = [
		`client_latitude IS NOT NULL`,
		`client_longitude IS NOT NULL`,
		`LENGTH(client_latitude) > 0`,
		`LENGTH(client_longitude) > 0`,
		`${metric} IS NOT NULL`,
		`LENGTH(${metric}) > 0`
	];
	const params: string[] = [];

	if (from) {
		params.push(from);
		conditions.push(`LEFT(test_date, 10) >= $${params.length}`);
	}
	if (to) {
		params.push(to);
		conditions.push(`LEFT(test_date, 10) <= $${params.length}`);
	}

	if (provider && provider !== 'all') {
		params.push(`%${provider}%`);
		conditions.push(`isp_generated ILIKE $${params.length}`);
	}

	// Individual records (exact GPS) or area-aggregated
	const query = aggregate ? `
		SELECT
			COALESCE(geo_area, 'Unknown')    AS area,
			'aggregated'                     AS provider,
			AVG(client_latitude::float)      AS lat,
			AVG(client_longitude::float)     AS lng,
			AVG(${metric}::float)            AS value,
			NULL                             AS test_date,
			COUNT(*)                         AS agg_count
		FROM ${table}
		WHERE ${conditions.join(' AND ')}
		GROUP BY geo_area
		HAVING AVG(${metric}::float) IS NOT NULL
		ORDER BY value DESC
		LIMIT 800
	` : `
		SELECT
			COALESCE(geo_area, 'Unknown')      AS area,
			COALESCE(isp_generated, 'Unknown') AS provider,
			client_latitude::float             AS lat,
			client_longitude::float            AS lng,
			${metric}::float                   AS value,
			test_date                          AS test_date,
			NULL                               AS agg_count
		FROM ${table}
		WHERE ${conditions.join(' AND ')}
		ORDER BY ${metric}::float DESC
		LIMIT 5000
	`;

	try {
		const pool = getPool();
		const result = await pool.query(query, params);
		return json({
			points: result.rows.map(r => ({
				area:      r.area,
				provider:  r.provider,
				lat:       Number(r.lat),
				lng:       Number(r.lng),
				value:     Number(r.value),
				test_date: r.test_date ?? null,
				count:     r.agg_count ? Number(r.agg_count) : null
			}))
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return json({ error: message }, { status: 500 });
	}
};
