import { GAUSSSERVER, GAUSSPORT, GAUSSDB, GAUSSUSER, GAUSSPASS } from '$env/static/private';
import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
	if (!pool) {
		pool = new Pool({
			host: GAUSSSERVER,
			port: Number(GAUSSPORT ?? 8000),
			database: GAUSSDB,
			user: GAUSSUSER,
			password: GAUSSPASS,
			connectionTimeoutMillis: 15000,
			ssl: false
		});
	}
	return pool;
}
