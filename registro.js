import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  // Configurar CORS para permitir peticiones desde tu HTML
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const { email, password, nombre, empresa, ruc, tipo } = req.body;

    if (!email || !password || !nombre || !empresa || !ruc || !tipo) {
      return res.status(400).json({ error: 'Faltan datos' });
    }

    // Conexión segura a Neon (usando la URL que ya tienes)
    const sql = neon(process.env.DATABASE_URL);

    if (tipo === 'registrar') {
      // 1. Crear empresa
      const empresaResult = await sql`
        INSERT INTO empresas (nombre, ruc) 
        VALUES (${empresa}, ${ruc}) 
        RETURNING id
      `;
      const empresaId = empresaResult[0].id;

      // 2. Crear usuario dueño
      await sql`
        INSERT INTO usuarios (empresa_id, email, password_hash, nombre_completo, rol) 
        VALUES (${empresaId}, ${email}, ${password}, ${nombre}, 'dueño')
      `;

      return res.status(200).json({ message: 'Empresa y usuario creados' });

    } else if (tipo === 'login') {
      // Login
      const user = await sql`
        SELECT u.*, e.nombre as empresa_nombre, e.ruc as empresa_ruc 
        FROM usuarios u 
        JOIN empresas e ON u.empresa_id = e.id 
        WHERE u.email = ${email} AND u.password_hash = ${password}
      `;

      if (user.length === 0) {
        return res.status(401).json({ error: 'Credenciales incorrectas' });
      }

      return res.status(200).json({ user: user[0] });
    }

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error interno', details: error.message });
  }
}