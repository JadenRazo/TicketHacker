// Small SQL-backed adapter for the exact Prisma calls exercised by these tests.
// Runs production transaction bodies/SQL against PostgreSQL; does not validate
// Prisma client generation, relation loading, or the full application schema.
function adapter(pool, application = 'ticket-fixture', client) {
  const query = (text, values) => (client || pool).query(text, values);
  const quote = name => '"' + name.replaceAll('"', '""') + '"';
  const db = {
    async $queryRaw(parts, ...values) {
      return (await query(parts.map((p, i) => p + (i < values.length ? `$${i + 1}` : '')).join(''), values)).rows;
    },
    async $transaction(fn) {
      const connection = await pool.connect();
      try {
        await connection.query('BEGIN');
        await connection.query("SELECT set_config('application_name', $1, true)", [application]);
        await connection.query("SET LOCAL statement_timeout='10s'; SET LOCAL lock_timeout='8s'; SET LOCAL deadlock_timeout='100ms'");
        const result = await fn(adapter(pool, application, connection));
        await connection.query('COMMIT');
        return result;
      } catch (error) { await connection.query('ROLLBACK'); throw error; }
      finally { connection.release(); }
    },
  };
  for (const [key, table] of Object.entries({ tenant: 'Tenant', ticket: 'Ticket', message: 'Message', agentOperation: 'AgentOperation' })) {
    const from = `public.${quote(table)}`;
    function whereClause(where, values) {
      return Object.entries(where || {}).map(([k, v]) => {
        if (v === null) return `${quote(k)} IS NULL`;
        if (v && typeof v === 'object' && v.in) { values.push(v.in); return `${quote(k)}=ANY($${values.length}::text[])`; }
        values.push(v); return `${quote(k)}=$${values.length}`;
      }).join(' AND ') || 'TRUE';
    }
    db[key] = {
      async findMany({ where, orderBy } = {}) {
        const values = []; const filter = whereClause(where, values);
        const order = (Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []).flatMap(o => Object.entries(o)).map(([k, d]) => `${quote(k)} ${d === 'desc' ? 'DESC' : 'ASC'}`).join(',');
        return (await query(`SELECT * FROM ${from} WHERE ${filter}${order ? ` ORDER BY ${order}` : ''}`, values)).rows;
      },
      async findFirst(q) { return (await this.findMany(q))[0] || null; },
      async findUnique(q) { return this.findFirst(q); },
      async create({ data }) {
        const fields = { ...data, ...(table === 'AgentOperation' ? { updatedAt: new Date() } : {}) };
        return (await query(`INSERT INTO ${from} (${Object.keys(fields).map(quote)}) VALUES (${Object.keys(fields).map((_, i) => `$${i + 1}`)}) RETURNING *`, Object.values(fields))).rows[0];
      },
      async updateMany({ where, data }) {
        const values = Object.values(data); const sets = Object.keys(data).map((k, i) => `${quote(k)}=$${i + 1}`);
        const result = await query(`UPDATE ${from} SET ${sets} WHERE ${whereClause(where, values)} RETURNING *`, values);
        return { count: result.rowCount, rows: result.rows };
      },
      async update(q) { const result = await this.updateMany(q); if (!result.count) throw Error('Record not found'); return result.rows[0]; },
    };
  }
  return db;
}
module.exports = { adapter };
