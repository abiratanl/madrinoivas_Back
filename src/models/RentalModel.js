const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class RentalModel {
  /**
   * Busca aluguel com todos os detalhes (Itens, Cliente, Parcelas e Pagamentos)
   */
  static async findById(id) {
    // 1. Dados do Aluguel + Cliente + Loja
    const sqlRental = `
      SELECT r.*, c.name as customer_name, c.cpf as customer_cpf, s.name as store_name
      FROM rentals r
      JOIN customers c ON r.customer_id = c.id
      JOIN stores s ON r.store_id = s.id
      WHERE r.id = ?
    `;
    const [rentalRows] = await db.query(sqlRental, [id]);
    if (rentalRows.length === 0) return null;
    const rental = rentalRows[0];

    // 2. Itens do Aluguel
    const sqlItems = `
      SELECT ri.*, p.name as product_name, p.code as product_code, pi.url_thumb as image_url
      FROM rental_items ri
      JOIN products p ON ri.product_id = p.id
      LEFT JOIN product_images pi ON p.id = pi.product_id AND pi.is_main = 1
      WHERE ri.rental_id = ?
    `;
    const [items] = await db.query(sqlItems, [id]);

    // 3. Parcelas (Financeiro)
    const sqlInstallments = `SELECT * FROM installments WHERE rental_id = ? ORDER BY number ASC`;
    const [installments] = await db.query(sqlInstallments, [id]);

    return { ...rental, items, installments };
  }

  /**
   * CRIAÇÃO DE ALUGUEL COM TRANSAÇÃO (All or Nothing)
   */
  static async createTransaction(data) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const rentalId = uuidv4();
      const {
        store_id, customer_id, user_id,
        start_date, end_date_scheduled, delivery_address_id, delivery_type,
        laundry_days_needed,
        items, // Array de { product_id, price }
        installments_config, // { count: 3, first_due_date: '...' }
        notes, discount, status // 'budget' ou 'reserved'
      } = data;

      // 1. Calcular Totais
      let totalAmount = 0;
      items.forEach(item => totalAmount += (parseFloat(item.unit_price) * (item.quantity || 1)));

      const finalAmount = totalAmount - (discount || 0);

      // 2. Inserir Contrato (Rental)
      const sqlRental = `
        INSERT INTO rentals (
          id, store_id, customer_id, user_id, delivery_address_id, delivery_type,
          laundry_days_needed, start_date, end_date_scheduled, status, total_amount, discount, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      await conn.query(sqlRental, [
        rentalId, store_id, customer_id, user_id, delivery_address_id || null, delivery_type || 'pickup_store',
        laundry_days_needed || 2, start_date, end_date_scheduled, status || 'reserved', finalAmount, discount || 0, notes
      ]);

      // 3. Inserir Itens e Atualizar Estoque
      for (const item of items) {
        const itemId = uuidv4();

        // A. Insere na tabela de ligação
        await conn.query(
          `INSERT INTO rental_items (id, rental_id, product_id, unit_price, quantity) VALUES (?, ?, ?, ?, ?)`,
          [itemId, rentalId, item.product_id, item.unit_price, item.quantity || 1]
        );

        // B. Atualiza status do produto (Se não for apenas um orçamento)
        if (status !== 'budget') {
          const newProductStatus = status === 'picked_up' ? 'rented' : 'reserved';
          await conn.query(
            `UPDATE products SET status = ? WHERE id = ?`,
            [newProductStatus, item.product_id]
          );
        }
      }

      // 4. Gerar Parcelas (Contas a Receber)
      if (installments_config && status !== 'budget') {
        const count = installments_config.count || 1;
        if (count <= 0) throw new Error('Número de parcelas deve ser maior que zero');
        const installmentValue = finalAmount / count;
        const firstDate = new Date(installments_config.first_due_date || new Date());

        for (let i = 1; i <= count; i++) {
          const instId = uuidv4();
          // Lógica simples de data: soma 30 dias a cada parcela (pode melhorar com moment/date-fns)
          const dueDate = new Date(firstDate);
          dueDate.setMonth(dueDate.getMonth() + (i - 1));

          await conn.query(
            `INSERT INTO installments (id, rental_id, number, total_installments, value, due_date, status)
             VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
            [instId, rentalId, i, count, installmentValue, dueDate]
          );
        }
      }

      await conn.commit();
      conn.release();
      return { id: rentalId, total_amount: finalAmount, status: status || 'reserved' };

    } catch (error) {
      await conn.rollback();
      conn.release();
      throw error;
    }
  }

  // Listagem simples
  static async findAll(filters = {}) {
    let sql = `
      SELECT r.id, r.status, r.start_date, r.end_date_scheduled, r.total_amount,
             c.name as customer_name, s.name as store_name
      FROM rentals r
      JOIN customers c ON r.customer_id = c.id
      JOIN stores s ON r.store_id = s.id
      WHERE 1=1
    `;
    const params = [];

    if (filters.store_id) {
      sql += ' AND r.store_id = ?';
      params.push(filters.store_id);
    }
    if (filters.status) {
      sql += ' AND r.status = ?';
      params.push(filters.status);
    }

    sql += ' ORDER BY r.created_at DESC';
    const [rows] = await db.query(sql, params);
    return rows;
  }

  /**
    * CONFIRMA RETIRADA (O cliente levou o traje)
    */
  static async pickUp(id) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      // 1. Atualiza status do aluguel
      await conn.query("UPDATE rentals SET status = 'picked_up' WHERE id = ? AND status IN ('reserved', 'budget')", [id]);

      // 2. Atualiza produtos: de 'reserved' ou 'budget' vão para 'rented' (em uso pelo cliente)
      await conn.query(
        "UPDATE products p JOIN rental_items ri ON p.id = ri.product_id SET p.status = 'rented' WHERE ri.rental_id = ? AND p.status IN ('reserved', 'budget')",
        [id]
      );

      await conn.commit();
      conn.release();
      return true;
    } catch (error) {
      await conn.rollback();
      conn.release();
      throw error;
    }
  }

  /**
   * EDITAR ALUGUEL (Alterar itens, datas ou descontos antes da retirada)
   */
  static async updateRental(id, data) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const { discount, notes, end_date_scheduled, items, status } = data;

      // 1. Valida se aluguel pode ser editado (não picked_up/returned/cancelled)
      const [rentalRows] = await conn.query(
        `SELECT id, status, start_date, end_date_scheduled, total_amount, discount 
         FROM rentals WHERE id = ? FOR UPDATE`,
        [id]
      );
      if (rentalRows.length === 0) throw new Error('Aluguel não encontrado');
      const rental = rentalRows[0];
      if (['picked_up', 'returned', 'cancelled'].includes(rental.status)) {
        throw new Error('Não é possível editar um aluguel em andamento ou finalizado');
      }

      // 2. Se vierem novos itens, substitui os antigos
      if (items && items.length > 0) {
        await conn.query("DELETE FROM rental_items WHERE rental_id = ?", [id]);
        for (const item of items) {
          await conn.query(
            `INSERT INTO rental_items (id, rental_id, product_id, unit_price, quantity) VALUES (?, ?, ?, ?, ?)`,
            [uuidv4(), id, item.product_id, item.unit_price, item.quantity || 1]
          );
        }
      }

      // 3. Recalcula total baseado nos itens ATUAIS do banco (segurança contra manipulação)
      const [sumResult] = await conn.query(
        "SELECT COALESCE(SUM(unit_price * quantity), 0) as total FROM rental_items WHERE rental_id = ?",
        [id]
      );
      const totalAmount = parseFloat(sumResult[0].total);
      const finalAmount = totalAmount - (discount || 0);

      // 4. Atualiza aluguel
      await conn.query(
        `UPDATE rentals SET discount = ?, notes = ?, end_date_scheduled = COALESCE(?, end_date_scheduled), total_amount = ?, status = ? WHERE id = ?`,
        [discount || 0, notes || null, end_date_scheduled, finalAmount, status || rental.status, id]
      );

      // 5. Recalcula parcelas pendentes se total mudou
      const [pendingInst] = await conn.query(
        `SELECT id, value FROM installments WHERE rental_id = ? AND status = 'pending' ORDER BY number ASC`,
        [id]
      );
      if (pendingInst.length > 0) {
        const newInstallmentValue = finalAmount / pendingInst.length;
        for (const inst of pendingInst) {
          await conn.query(`UPDATE installments SET value = ? WHERE id = ?`, [newInstallmentValue, inst.id]);
        }
      }

      await conn.commit();
      conn.release();
      return true;
    } catch (error) {
      await conn.rollback();
      conn.release();
      throw error;
    }
  }

  /**
   * PRORROGAR ALUGUEL (Cliente ficou mais dias)
   */
  static async extendRental(id, newEndDate, extraAmount = 0) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // 1. Trava o aluguel e valida estado (não pode estender returned/cancelled/budget/reserved)
      const [rentalRows] = await conn.query(
        `SELECT id, status, start_date, end_date_scheduled, total_amount FROM rentals WHERE id = ? FOR UPDATE`,
        [id]
      );
      if (rentalRows.length === 0) throw new Error('Aluguel não encontrado');
      const rental = rentalRows[0];

      const invalidStatuses = ['returned', 'cancelled', 'budget', 'reserved'];
      if (invalidStatuses.includes(rental.status)) {
        throw new Error(`Não é possível prorrogar aluguel com status "${rental.status}"`);
      }

      // 2. Valida se nova data é posterior à atual
      const currentEnd = new Date(rental.end_date_scheduled);
      const newEnd = new Date(newEndDate);
      if (newEnd <= currentEnd) {
        throw new Error('Nova data de devolução deve ser posterior à data atual');
      }

      // 3. Atualiza aluguel (data + valor total)
      await conn.query(
        `UPDATE rentals SET end_date_scheduled = ?, total_amount = total_amount + ? WHERE id = ?`,
        [newEndDate, extraAmount, id]
      );

      // 4. Recalcula parcelas pendentes (rateia valor extra nas parcelas a vencer)
      const [pendingInst] = await conn.query(
        `SELECT id, value FROM installments WHERE rental_id = ? AND status = 'pending' ORDER BY number ASC`,
        [id]
      );
      if (pendingInst.length > 0 && extraAmount > 0) {
        const extraPerInstallment = extraAmount / pendingInst.length;
        for (const inst of pendingInst) {
          const newValue = parseFloat(inst.value) + extraPerInstallment;
          await conn.query(
            `UPDATE installments SET value = ? WHERE id = ?`,
            [newValue, inst.id]
          );
        }
      }

      await conn.commit();
      conn.release();
      return true;
    } catch (error) {
      await conn.rollback();
      conn.release();
      throw error;
    }
  }

  /**
   * DEVOLUÇÃO (Corrigido para usar end_date_real e aceitar multa)
   */
  static async returnRental(id, penaltyFee = 0) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // 1. Trava aluguel e valida estado (protege contra double-return)
      const [rentalRows] = await conn.query(
        `SELECT id, status, start_date, end_date_scheduled, total_amount, penalty_fee 
         FROM rentals WHERE id = ? AND status NOT IN ('returned', 'cancelled') FOR UPDATE`,
        [id]
      );
      if (rentalRows.length === 0) {
        throw new Error('Aluguel não encontrado ou já finalizado/cancelado');
      }
      const rental = rentalRows[0];

      // 2. Calcula multa automática por atraso (se não vier valor do frontend)
      let finalPenaltyFee = penaltyFee;
      if (penaltyFee === 0) {
        const scheduledEnd = new Date(rental.end_date_scheduled);
        const now = new Date();
        if (now > scheduledEnd) {
          const daysLate = Math.ceil((now - scheduledEnd) / (1000 * 60 * 60 * 24));
          const rentalDays = Math.max(1, Math.ceil((scheduledEnd - new Date(rental.start_date)) / (1000 * 60 * 60 * 24)));
          const dailyRate = rental.total_amount / rentalDays;
          // Regra de negócio: 10% da diária por dia de atraso (ajuste conforme sua regra)
          finalPenaltyFee = daysLate * dailyRate * 0.10;
        }
      }

      // 3. Produtos -> lavanderia
      const [items] = await conn.query('SELECT product_id FROM rental_items WHERE rental_id = ?', [id]);
      for (const item of items) {
        await conn.query("UPDATE products SET status = 'laundry' WHERE id = ?", [item.product_id]);
      }

      // 4. Finaliza aluguel com data real e multa calculada
      await conn.query(
        `UPDATE rentals SET status = 'returned', end_date_real = NOW(), penalty_fee = ? WHERE id = ?`,
        [finalPenaltyFee, id]
      );

      // 5. Se houver multa, cria parcela extra de "penalty" (opcional, mas recomendado)
      if (finalPenaltyFee > 0) {
        const instId = uuidv4();
        await conn.query(
          `INSERT INTO installments (id, rental_id, number, total_installments, value, due_date, status, type)
           VALUES (?, ?, 999, 999, ?, NOW(), 'pending', 'penalty')`,
          [instId, id, finalPenaltyFee]
        );
      }

      await conn.commit();
      conn.release();
      return { penaltyFee: finalPenaltyFee };
    } catch (error) {
      await conn.rollback();
      conn.release();
      throw error;
    }
  }

  /**
   * Cancela uma reserva e libera os produtos imediatamente
   */
  static async cancelRental(id) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // 1. Busca itens
      const [items] = await conn.query('SELECT product_id FROM rental_items WHERE rental_id = ?', [id]);

      // 2. Libera produtos (voltam a ficar available)
      for (const item of items) {
        await conn.query(
          "UPDATE products SET status = 'available' WHERE id = ?",
          [item.product_id]
        );
      }

      // 3. Atualiza status do aluguel
      // Nota: As parcelas financeiras podem ser canceladas aqui também se desejar,
      // mas vamos manter simples por enquanto.
      await conn.query(
        "UPDATE rentals SET status = 'cancelled' WHERE id = ?",
        [id]
      );

      await conn.commit();
      conn.release();
      return true;

    } catch (error) {
      await conn.rollback();
      conn.release();
      throw error;
    }
  }
}

module.exports = RentalModel;