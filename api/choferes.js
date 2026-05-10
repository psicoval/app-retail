const { neon } = require('@neondatabase/serverless');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const sql = neon(process.env.DATABASE_URL);
    const { action, empresa_id, chofer_id, nombre, telefono, vehiculo } = req.body;

    if (!action || !empresa_id) {
      return res.status(400).json({ error: 'Faltan parámetros básicos (action, empresa_id)' });
    }

    if (action === 'listar') {
      const choferes = await sql`
        SELECT id, nombre, telefono, vehiculo, activo, created_at
        FROM choferes
        WHERE empresa_id = ${empresa_id} AND activo = TRUE
        ORDER BY nombre ASC
      `;
      return res.status(200).json({ choferes });
    }

    if (action === 'crear') {
      if (!nombre || !nombre.trim()) {
        return res.status(400).json({ error: 'Nombre obligatorio' });
      }
      const rows = await sql`
        INSERT INTO choferes (empresa_id, nombre, telefono, vehiculo)
        VALUES (${empresa_id}, ${nombre.trim()}, ${telefono || null}, ${vehiculo || null})
        RETURNING *
      `;
      return res.status(200).json({ chofer: rows[0] });
    }

    if (action === 'actualizar') {
      if (!chofer_id) return res.status(400).json({ error: 'Falta chofer_id' });
      const rows = await sql`
        UPDATE choferes
        SET nombre = ${nombre},
            telefono = ${telefono || null},
            vehiculo = ${vehiculo || null},
            updated_at = NOW()
        WHERE id = ${chofer_id} AND empresa_id = ${empresa_id}
        RETURNING *
      `;
      if (rows.length === 0) return res.status(404).json({ error: 'Chofer no encontrado' });
      return res.status(200).json({ chofer: rows[0] });
    }

    if (action === 'eliminar') {
      if (!chofer_id) return res.status(400).json({ error: 'Falta chofer_id' });
      await sql`
        UPDATE choferes
        SET activo = FALSE, updated_at = NOW()
        WHERE id = ${chofer_id} AND empresa_id = ${empresa_id}
      `;
      return res.status(200).json({ message: 'Chofer eliminado' });
    }

    return res.status(400).json({ error: 'Acción inválida' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
