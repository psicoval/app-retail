const { neon } = require('@neondatabase/serverless');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const { email, password, nombre, empresa, ruc, tipo } = req.body;

    if (!email || !password || !tipo) {
      return res.status(400).json({ error: 'Faltan datos' });
    }

    const sql = neon(process.env.DATABASE_URL);

    if (tipo === 'registrar') {
      if (!nombre || !empresa || !ruc) {
        return res.status(400).json({ error: 'Faltan datos de empresa' });
      }
      await sql`INSERT INTO empresas (nombre, ruc) VALUES (${empresa}, ${ruc})`;
      const empResult = await sql`SELECT id FROM empresas WHERE ruc = ${ruc} LIMIT 1`;
      const empresaId = empResult[0].id;
      await sql`INSERT INTO usuarios (empresa_id, email, password_hash, nombre_completo, rol)
                VALUES (${empresaId}, ${email}, ${password}, ${nombre}, 'dueño')`;
      return res.status(200).json({ message: 'Cuenta creada' });
    }

    if (tipo === 'login') {
      const result = await sql`
        SELECT u.*, e.nombre AS empresa_nombre
        FROM usuarios u
        JOIN empresas e ON u.empresa_id = e.id
        WHERE u.email = ${email} AND u.password_hash = ${password}
      `;
      if (result.length === 0) {
        return res.status(401).json({ error: 'Credenciales incorrectas' });
      }
      return res.status(200).json({ user: result[0] });
    }

    return res.status(400).json({ error: 'Tipo inválido' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
