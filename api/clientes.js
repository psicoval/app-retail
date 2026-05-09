const { neon } = require('@neondatabase/serverless');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const sql = neon(process.env.DATABASE_URL);
    const {
      action, empresa_id, cliente_id,
      nombre, telefono, direccion, referencia, lat, lng, notas
    } = req.body;

    if (!action || !empresa_id) {
      return res.status(400).json({ error: 'Faltan parámetros básicos (action, empresa_id)' });
    }

    if (action === 'listar') {
      const clientes = await sql`
        SELECT id, nombre, telefono, direccion, referencia, lat, lng, notas, activo, created_at
        FROM clientes
        WHERE empresa_id = ${empresa_id} AND activo = TRUE
        ORDER BY nombre ASC
      `;
      return res.status(200).json({ clientes });
    }

    if (action === 'crear') {
      if (!nombre || !direccion) {
        return res.status(400).json({ error: 'Nombre y dirección son obligatorios' });
      }
      const result = await sql`
        INSERT INTO clientes (empresa_id, nombre, telefono, direccion, referencia, lat, lng, notas)
        VALUES (${empresa_id}, ${nombre}, ${telefono || null}, ${direccion},
                ${referencia || null}, ${lat || null}, ${lng || null}, ${notas || null})
        RETURNING *
      `;
      return res.status(200).json({ cliente: result[0] });
    }

    if (action === 'actualizar') {
      if (!cliente_id) return res.status(400).json({ error: 'Falta cliente_id' });
      if (!nombre || !direccion) {
        return res.status(400).json({ error: 'Nombre y dirección son obligatorios' });
      }
      const result = await sql`
        UPDATE clientes
        SET nombre = ${nombre},
            telefono = ${telefono || null},
            direccion = ${direccion},
            referencia = ${referencia || null},
            lat = ${lat || null},
            lng = ${lng || null},
            notas = ${notas || null},
            updated_at = NOW()
        WHERE id = ${cliente_id} AND empresa_id = ${empresa_id}
        RETURNING *
      `;
      if (result.length === 0) {
        return res.status(404).json({ error: 'Cliente no encontrado' });
      }
      return res.status(200).json({ cliente: result[0] });
    }

    if (action === 'eliminar') {
      if (!cliente_id) return res.status(400).json({ error: 'Falta cliente_id' });
      await sql`
        UPDATE clientes
        SET activo = FALSE, updated_at = NOW()
        WHERE id = ${cliente_id} AND empresa_id = ${empresa_id}
      `;
      return res.status(200).json({ message: 'Cliente eliminado' });
    }

    return res.status(400).json({ error: 'Acción inválida' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
