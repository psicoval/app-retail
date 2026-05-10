const { neon } = require('@neondatabase/serverless');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const sql = neon(process.env.DATABASE_URL);
    const { action, empresa_id, producto_id, nombre, categoria, precio, stock } = req.body;

    if (!action || !empresa_id) {
      return res.status(400).json({ error: 'Faltan parámetros básicos (action, empresa_id)' });
    }

    if (action === 'listar') {
      const productos = await sql`
        SELECT id, nombre, categoria, precio, stock, activo, created_at
        FROM productos
        WHERE empresa_id = ${empresa_id} AND activo = TRUE
        ORDER BY nombre ASC
      `;
      return res.status(200).json({ productos });
    }

    if (action === 'crear') {
      if (!nombre || !nombre.trim()) {
        return res.status(400).json({ error: 'Nombre obligatorio' });
      }
      const rows = await sql`
        INSERT INTO productos (empresa_id, nombre, categoria, precio, stock)
        VALUES (${empresa_id}, ${nombre.trim()}, ${categoria || null},
                ${precio || 0}, ${stock || 0})
        RETURNING *
      `;
      return res.status(200).json({ producto: rows[0] });
    }

    if (action === 'actualizar') {
      if (!producto_id) return res.status(400).json({ error: 'Falta producto_id' });
      const rows = await sql`
        UPDATE productos
        SET nombre = ${nombre},
            categoria = ${categoria || null},
            precio = ${precio || 0},
            stock = ${stock || 0},
            updated_at = NOW()
        WHERE id = ${producto_id} AND empresa_id = ${empresa_id}
        RETURNING *
      `;
      if (rows.length === 0) return res.status(404).json({ error: 'Producto no encontrado' });
      return res.status(200).json({ producto: rows[0] });
    }

    if (action === 'eliminar') {
      if (!producto_id) return res.status(400).json({ error: 'Falta producto_id' });
      await sql`
        UPDATE productos
        SET activo = FALSE, updated_at = NOW()
        WHERE id = ${producto_id} AND empresa_id = ${empresa_id}
      `;
      return res.status(200).json({ message: 'Producto eliminado' });
    }

    return res.status(400).json({ error: 'Acción inválida' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
