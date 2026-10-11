const oracledb = require('oracledb');

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.autoCommit = false;

let pool;

async function initializePool() {
  if (pool) return pool;
  const { DB_USER, DB_PASSWORD, DB_CONNECT_STRING } = process.env;
  if (!DB_USER || !DB_PASSWORD || !DB_CONNECT_STRING) {
    throw new Error('Missing DB_USER, DB_PASSWORD, or DB_CONNECT_STRING in backend/.env');
  }
  pool = await oracledb.createPool({
    user: DB_USER,
    password: DB_PASSWORD,
    connectString: DB_CONNECT_STRING,
    poolMin: 1,
    poolMax: 8,
    poolIncrement: 1,
    poolTimeout: 60
  });
  return pool;
}

async function execute(sql, binds = {}, options = {}) {
  const p = await initializePool();
  let connection;
  try {
    connection = await p.getConnection();
    return await connection.execute(sql, binds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      autoCommit: options.autoCommit ?? false
    });
  } finally {
    if (connection) await connection.close();
  }
}

async function closePool() {
  if (pool) {
    await pool.close(10);
    pool = undefined;
  }
}

module.exports = { initializePool, execute, closePool };
