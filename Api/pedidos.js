// api/pedidos.js
const { neon } = require('@neondatabase/serverless');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { action, userId, empresaId, ...data } = body;
    const sql = neon(process.env.DATABASE_URL);

    if (action === 'crear') {
      await sql`INSERT INTO pedidos (empresa_id, cliente_nombre, cliente_telefono, cliente_direccion, cliente_referencia, productos, total, fecha_entrega, created_by) VALUES (${empresaId}, ${data.cliente_nombre}, ${data.cliente_telefono}, ${data.cliente_direccion}, ${data.cliente_referencia}, ${data.productos}, 0, ${data.fecha_entrega}, ${userId})`;
      res.status(200).json({ message: 'Pedido creado' });

    } else if (action === 'listar') {
      const pedidos = await sql`SELECT * FROM pedidos WHERE empresa_id = ${empresaId} ORDER BY created_at DESC`;
      res.status(200).json({ pedidos });

    } else if (action === 'actualizar') {
      await sql`UPDATE pedidos SET estado = ${data.estado} WHERE id = ${data.pedido_id}`;
      res.status(200).json({ message: 'Estado actualizado' });
    } else {
      res.status(400).json({ error: 'Acción no válida' });
    }

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};