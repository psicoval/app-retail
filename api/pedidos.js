const { neon } = require('@neondatabase/serverless');

const ESTADOS_VALIDOS = ['pendiente', 'asignado', 'en_ruta', 'entregado', 'cancelado'];

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
          p.pagado, p.pagado_at, p.entregado_at,
          c.id AS cliente_id, c.nombre AS cliente_nombre,
          c.telefono AS cliente_telefono, c.direccion AS cliente_direccion,
          ch.id AS chofer_id, ch.nombre AS chofer_nombre, ch.telefono AS chofer_telefono,
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
        LEFT JOIN choferes ch ON p.chofer_id = ch.id
        WHERE p.empresa_id = ${empresa_id}
        ORDER BY p.created_at DESC
      `;
      return res.status(200).json({ pedidos });
    }

    // ============ CREAR ============
    if (action === 'crear') {
      const { cliente, items, fecha_entrega, notas, created_by } = req.body;

      if (!cliente) return res.status(400).json({ error: 'Falta información del cliente' });
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Debe incluir al menos un producto' });
      }

      // 1. Resolver cliente
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

      // 2. Resolver productos y total
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

      // 3. Pedido
      const pedidoRows = await sql`
        INSERT INTO pedidos (empresa_id, cliente_id, total, fecha_entrega, notas, created_by)
        VALUES (${empresa_id}, ${clienteId}, ${total},
                ${fecha_entrega || null}, ${notas || null}, ${created_by || null})
        RETURNING *
      `;
      const pedido = pedidoRows[0];

      // 4. Detalles
      for (const item of resolvedItems) {
        await sql`
          INSERT INTO detalle_pedido (pedido_id, producto_id, cantidad, precio_unitario)
          VALUES (${pedido.id}, ${item.producto_id}, ${item.cantidad}, ${item.precio_unitario})
        `;
      }

      return res.status(200).json({ pedido });
    }

    // ============ ASIGNAR CHOFER ============
    if (action === 'asignar_chofer') {
      const { pedido_id, chofer_id } = req.body;
      if (!pedido_id) return res.status(400).json({ error: 'Falta pedido_id' });
      if (!chofer_id) return res.status(400).json({ error: 'Falta chofer_id' });

      // Verificar que el chofer pertenece a esta empresa
      const cf = await sql`
        SELECT id FROM choferes WHERE id = ${chofer_id} AND empresa_id = ${empresa_id}
      `;
      if (cf.length === 0) return res.status(404).json({ error: 'Chofer no encontrado' });

      // Si está pendiente, pasa a asignado. Si ya estaba asignado/en_ruta, solo cambia chofer.
      const rows = await sql`
        UPDATE pedidos
        SET chofer_id = ${chofer_id},
            estado = CASE WHEN estado = 'pendiente' THEN 'asignado' ELSE estado END,
            updated_at = NOW()
        WHERE id = ${pedido_id} AND empresa_id = ${empresa_id}
        RETURNING *
      `;
      if (rows.length === 0) return res.status(404).json({ error: 'Pedido no encontrado' });
      return res.status(200).json({ pedido: rows[0] });
    }

    // ============ CAMBIAR ESTADO ============
    if (action === 'cambiar_estado') {
      const { pedido_id, nuevo_estado } = req.body;
      if (!pedido_id) return res.status(400).json({ error: 'Falta pedido_id' });
      if (!ESTADOS_VALIDOS.includes(nuevo_estado)) {
        return res.status(400).json({ error: 'Estado inválido' });
      }

      const rows = await sql`
        UPDATE pedidos
        SET estado = ${nuevo_estado},
            entregado_at = CASE WHEN ${nuevo_estado} = 'entregado' AND entregado_at IS NULL
                                THEN NOW() ELSE entregado_at END,
            updated_at = NOW()
        WHERE id = ${pedido_id} AND empresa_id = ${empresa_id}
        RETURNING *
      `;
      if (rows.length === 0) return res.status(404).json({ error: 'Pedido no encontrado' });
      return res.status(200).json({ pedido: rows[0] });
    }

    // ============ TOGGLE PAGADO ============
    if (action === 'toggle_pagado') {
      const { pedido_id } = req.body;
      if (!pedido_id) return res.status(400).json({ error: 'Falta pedido_id' });

      const rows = await sql`
        UPDATE pedidos
        SET pagado = NOT pagado,
            pagado_at = CASE WHEN NOT pagado THEN NOW() ELSE NULL END,
            updated_at = NOW()
        WHERE id = ${pedido_id} AND empresa_id = ${empresa_id}
        RETURNING *
      `;
      if (rows.length === 0) return res.status(404).json({ error: 'Pedido no encontrado' });
      return res.status(200).json({ pedido: rows[0] });
    }

    return res.status(400).json({ error: 'Acción inválida' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
