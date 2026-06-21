require('dotenv').config();
const express = require('express');
const cors = require('cors');
const os = require('os');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.warn('ADVERTENCIA: no se definio API_KEY en .env. El endpoint de escritura quedara sin proteccion.');
}

// ============================================================
//  BASE DE DATOS - PostgreSQL
// ============================================================
const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT, 10) || 5432,
  database: process.env.PGDATABASE || 'anemometro',
  user: process.env.PGUSER || 'anemometro',
  password: process.env.PGPASSWORD || 'anemometro',
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS lecturas (
        id SERIAL PRIMARY KEY,
        periodo_s REAL,
        omega_rad_s REAL,
        v_real_m_s REAL,
        km_h REAL,
        recibido_en TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_lecturas_recibido_en ON lecturas (recibido_en)
    `);
    console.log('Tabla lecturas inicializada correctamente');
  } finally {
    client.release();
  }
}

// ============================================================
//  MIDDLEWARE
// ============================================================
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'web')));

function verificarApiKey(req, res, next) {
  if (!API_KEY) return next();
  const recibida = req.headers['x-api-key'];
  if (recibida !== API_KEY) {
    return res.status(401).json({ error: 'API key invalida o ausente' });
  }
  next();
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'web', 'dashboard_anemometro.html'));
});

// ============================================================
//  POST /api/lecturas  — el ESP32 envia una nueva lectura
// ============================================================
app.post('/api/lecturas', verificarApiKey, async (req, res) => {
  const { periodo_s, omega_rad_s, v_real_m_s, km_h } = req.body;

  const campos = { periodo_s, omega_rad_s, v_real_m_s, km_h };
  const faltante = Object.entries(campos).find(([, v]) => v === undefined);
  if (faltante) {
    return res.status(400).json({
      error: 'Faltan campos en el cuerpo de la peticion',
      campos_esperados: ['periodo_s', 'omega_rad_s', 'v_real_m_s', 'km_h'],
    });
  }

  await pool.query(
    'INSERT INTO lecturas (periodo_s, omega_rad_s, v_real_m_s, km_h) VALUES ($1, $2, $3, $4)',
    [periodo_s, omega_rad_s, v_real_m_s, km_h]
  );
  res.status(201).json({ ok: true });
});

// ============================================================
//  GET /api/lecturas?limit=100  — historico para un dashboard
// ============================================================
app.get('/api/lecturas', async (req, res) => {
  const limite = Math.min(parseInt(req.query.limit, 10) || 100, 1000);
  const desde = req.query.desde;
  const hasta = req.query.hasta;

  if (desde !== undefined) {
    if (isNaN(new Date(desde).getTime())) {
      return res.status(400).json({ error: 'Parametro desde invalido. Debe ser ISO 8601.' });
    }
  }
  if (hasta !== undefined) {
    if (isNaN(new Date(hasta).getTime())) {
      return res.status(400).json({ error: 'Parametro hasta invalido. Debe ser ISO 8601.' });
    }
  }

  const { rows } = await pool.query(
    'SELECT * FROM lecturas WHERE ($2::timestamptz IS NULL OR recibido_en >= $2::timestamptz) AND ($3::timestamptz IS NULL OR recibido_en <= $3::timestamptz) ORDER BY id DESC LIMIT $1',
    [limite, desde || null, hasta || null]
  );
  res.json(rows.reverse());
});

// ============================================================
//  GET /api/lecturas/ultima  — la lectura mas reciente
// ============================================================
app.get('/api/lecturas/ultima', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM lecturas ORDER BY id DESC LIMIT 1');
  res.json(rows[0] || {});
});

// ============================================================
//  DELETE /api/lecturas/limpiar  — limpia lecturas con periodo_s < 0.1
// ============================================================
app.delete('/api/lecturas/limpiar', verificarApiKey, async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM lecturas WHERE periodo_s < 0.1');
  res.json({ ok: true, eliminadas: rowCount });
});

// ============================================================
//  GET /api/status  — salud del servicio
// ============================================================
app.get('/api/status', async (req, res) => {
  const { rows } = await pool.query('SELECT COUNT(*) AS total FROM lecturas');
  res.json({ ok: true, total_lecturas: parseInt(rows[0].total, 10) });
});

// ============================================================
//  INICIAR SERVIDOR
// ============================================================
initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`API del anemometro escuchando en el puerto ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Error al conectar con PostgreSQL:', err.message);
    process.exit(1);
  });
