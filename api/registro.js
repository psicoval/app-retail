const { neon } = require('@neondatabase/serverless');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405).end(JSON.stringify({ error: 'Método no permitido' }));
    return;
  }

  try {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { email, password, nombre, empresa, ruc, tipo } = data;

        if (!email || !password || !nombre || !empresa || !ruc || !tipo) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Faltan datos' }));
        }

        const sql = neon(process.env.DATABASE_URL);

        if (tipo === 'registrar') {
          await sql`INSERT INTO empresas (nombre, ruc) VALUES (${empresa}, ${ruc})`;
          const empResult = await sql`SELECT id FROM empresas WHERE ruc = ${ruc} LIMIT 1`;
          const empresaId = empResult[0].id;

          await sql`INSERT INTO usuarios (empresa_id, email, password_hash, nombre_completo, rol) VALUES (${empresaId}, ${email}, ${password}, ${nombre}, 'dueño')`;

          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ message: 'Cuenta creada' }));

        } else if (tipo === 'login') {
          const result = await sql`SELECT u.*, e.nombre as empresa_nombre FROM usuarios u JOIN empresas e ON u.empresa_id = e.id WHERE u.email = ${email} AND u.password_hash = ${password}`;

          if (result.length === 0) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Credenciales incorrectas' }));
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ user: result[0] }));
        }

      } catch (parseError) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'JSON inválido' }));
      }
    });

  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: error.message }));
  }
};
