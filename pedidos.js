import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const sql = neon(process.env.DATABASE_URL);
    const { action, userId, empresaId, ...data } = req.body;

    if (action === 'crear') {
      await sql`
        INSERT INTO pedidos (empresa_id, cliente_nombre, cliente_telefono, cliente_direccion, cliente_referencia, productos, total, fecha_entrega, created_by)
        VALUES (${empresaId}, ${data.cliente_nombre}, ${data.cliente_telefono}, ${data.cliente_direccion}, ${data.cliente_referencia}, ${data.productos}, 0, ${data.fecha_entrega}, ${userId})
      `;
      return res.status(200).json({ message: 'Pedido creado' });

    } else if (action === 'listar') {
      const pedidos = await sql`
        SELECT * FROM pedidos WHERE empresa_id = ${empresaId} ORDER BY created_at DESC
      `;
      return res.status(200).json({ pedidos });

    } else if (action === 'actualizar') {
      await sql`
        UPDATE pedidos SET estado = ${data.estado} WHERE id = ${data.pedido_id}
      `;
      return res.status(200).json({ message: 'Estado actualizado' });
    }

    return res.status(400).json({ error: 'Acción no válida' });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}