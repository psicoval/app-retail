const { neon } = require('@neondatabase/serverless');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const sql = neon(process.env.DATABASE_URL);
    const { action, empresa_id } = req.body;

    if (!action || !empresa_id) {
      return res.status(400).json({ error: 'Faltan parámetros básicos (action, empresa_id)' });
    }

    // ============ LISTAR ============
    if (action === 'listar') {
      const pedidos = await sql`
        SELECT
          p.id, p.estado, p.total, p.fecha_entrega, p.notas, p.created_at,
          c.id AS cliente_id, c.nombre AS cliente_nombre,
          c.telefono AS cliente_telefono, c.direccion AS cliente_direccion,
          COALESCE(
            (SELECT json_agg(json_build_object(
              'cantidad', d.cantidad,
              'precio_unitario', d.precio_unitario,
              'producto_nombre', pr.nombre
            ) ORDER BY d.id)
            FROM detalle_pedido d
            JOIN productos pr ON d.producto_id = pr.id
            WHERE d.pedido_id = p.id),
            '[]'::json
          ) AS items
        FROM pedidos p
        JOIN clientes c ON p.cliente_id = c.id
        WHERE p.empresa_id = ${empresa_id}
        ORDER BY p.created_at DESC
      `;
      return res.status(200).json({ pedidos });
    }

    // ============ CREAR (con cliente y productos inline) ============
    if (action === 'crear') {
      const { cliente, items, fecha_entrega, notas, created_by } = req.body;

      if (!cliente) {
        return res.status(400).json({ error: 'Falta información del cliente' });
      }
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Debe incluir al menos un producto' });
      }

      // 1. Resolver cliente: usar existente o crear nuevo
      let clienteId = cliente.id;
      if (!clienteId) {
        if (!cliente.nombre || !cliente.direccion) {
          return res.status(400).json({ error: 'Cliente nuevo requiere nombre y dirección' });
        }
        const newClienteRows = await sql`
          INSERT INTO clientes (empresa_id, nombre, telefono, direccion, referencia)
          VALUES (${empresa_id}, ${cliente.nombre}, ${cliente.telefono || null},
                  ${cliente.direccion}, ${cliente.referencia || null})
          RETURNING id
        `;
        clienteId = newClienteRows[0].id;
      }

      // 2. Resolver productos y calcular total
      let total = 0;
      const resolvedItems = [];
      for (const item of items) {
        const cantidad = parseInt(item.cantidad);
        const precio = parseFloat(item.precio_unitario);
        if (!cantidad || cantidad <= 0) {
          return res.status(400).json({ error: 'Cantidad inválida en uno de los productos' });
        }
        if (isNaN(precio) || precio < 0) {
          return res.status(400).json({ error: 'Precio inválido en uno de los productos' });
        }

        let productoId = item.producto_id;
        if (!productoId) {
          if (!item.nombre || !item.nombre.trim()) {
            return res.status(400).json({ error: 'Producto nuevo requiere nombre' });
          }
          const newProdRows = await sql`
            INSERT INTO productos (empresa_id, nombre, precio)
            VALUES (${empresa_id}, ${item.nombre.trim()}, ${precio})
            RETURNING id
          `;
          productoId = newProdRows[0].id;
        }

        resolvedItems.push({ producto_id: productoId, cantidad, precio_unitario: precio });
        total += cantidad * precio;
      }

      // 3. Crear pedido (cabecera)
      const pedidoRows = await sql`
        INSERT INTO pedidos (empresa_id, cliente_id, total, fecha_entrega, notas, created_by)
        VALUES (${empresa_id}, ${clienteId}, ${total},
                ${fecha_entrega || null}, ${notas || null}, ${created_by || null})
        RETURNING *
      `;
      const pedido = pedidoRows[0];

      // 4. Insertar detalles
      for (const item of resolvedItems) {
        await sql`
          INSERT INTO detalle_pedido (pedido_id, producto_id, cantidad, precio_unitario)
          VALUES (${pedido.id}, ${item.producto_id}, ${item.cantidad}, ${item.precio_unitario})
        `;
      }

      return res.status(200).json({ pedido });
    }

    return res.status(400).json({ error: 'Acción inválida' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
