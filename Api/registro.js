// api/registro.js
const { neon } = require('@neondatabase/serverless');

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { email, password, nombre, empresa, ruc, tipo } = body;

    if (!email || !password || !nombre || !empresa || !ruc || !tipo) {
      res.status(400).json({ error: 'Faltan datos' });
      return;
    }

    const sql = neon(process.env.DATABASE_URL);

    if (tipo === 'registrar') {
      await sql`INSERT INTO empresas (nombre, ruc) VALUES (${empresa}, ${ruc})`;
      const emp = await sql`SELECT id FROM empresas WHERE ruc = ${ruc} LIMIT 1`;
      const empresaId = emp[0].id;

      await sql`INSERT INTO usuarios (empresa_id, email, password_hash, nombre_completo, rol) VALUES (${empresaId}, ${email}, ${password}, ${nombre}, 'dueño')`;

      res.status(200).json({ message: 'Cuenta creada' });

    } else if (tipo === 'login') {
      const user = await sql`SELECT u.*, e.nombre as empresa_nombre FROM usuarios u JOIN empresas e ON u.empresa_id = e.id WHERE u.email = ${email} AND u.password_hash = ${password}`;

      if (user.length === 0) {
        res.status(401).json({ error: 'Credenciales incorrectas' });
        return;
      }

      res.status(200).json({ user: user[0] });
    }

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno: ' + error.message });
  }
};