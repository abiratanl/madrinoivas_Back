const Store = require('../models/StoreModel');
const { getPublicUrl, extractKey, deleteFile } = require('../services/uploadService');

// Must match the `type` ENUM of the contacts table
const ALLOWED_CONTACT_TYPES = ['mobile', 'whatsapp', 'landline', 'email', 'instagram', 'facebook'];
const CNPJ_REGEX = /^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/;
const CPF_REGEX = /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/;

const toPublicSignatureUrl = (value) => {
  if (!value) return null;
  if (/^(https?:|data:)/i.test(value)) return value;
  return getPublicUrl(value);
};

const withSignatureUrl = (store) => {
  if (!store) return store;
  return {
    ...store,
    owner_signature_url: toPublicSignatureUrl(store.owner_signature),
  };
};

const normalizeOptionalString = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
};

const validateStorePayload = (body, { partial = false } = {}) => {
  const errors = [];

  if (!partial || body.name !== undefined) {
    if (!body.name || !String(body.name).trim()) {
      errors.push('Nome da loja é obrigatório.');
    }
  }

  if (body.cnpj !== undefined && body.cnpj !== null && body.cnpj !== '') {
    if (!CNPJ_REGEX.test(String(body.cnpj).trim())) {
      errors.push('CNPJ inválido. Use o formato 00.000.000/0000-00.');
    }
  }

  if (body.owner_cpf !== undefined && body.owner_cpf !== null && body.owner_cpf !== '') {
    if (!CPF_REGEX.test(String(body.owner_cpf).trim())) {
      errors.push('CPF do responsável inválido. Use o formato 000.000.000-00.');
    }
  }

  if (body.contacts !== undefined) {
    if (!Array.isArray(body.contacts)) {
      errors.push('Contatos devem ser enviados como uma lista.');
    } else {
      for (const contact of body.contacts) {
        if (!contact || !ALLOWED_CONTACT_TYPES.includes(contact.type)) {
          errors.push(`Tipo de contato inválido. Use: ${ALLOWED_CONTACT_TYPES.join(', ')}.`);
          break;
        }
        if (!contact.value || !String(contact.value).trim()) {
          errors.push('Todo contato deve ter um valor preenchido.');
          break;
        }
      }
    }
  }

  if (body.addresses !== undefined && !Array.isArray(body.addresses)) {
    errors.push('Endereços devem ser enviados como uma lista.');
  }

  return errors;
};

const buildStoreData = (body) => {
  const data = {};

  if (body.name !== undefined) data.name = String(body.name).trim();

  const cnpj = normalizeOptionalString(body.cnpj);
  if (cnpj !== undefined) data.cnpj = cnpj;

  const ownerName = normalizeOptionalString(body.owner_name);
  if (ownerName !== undefined) data.owner_name = ownerName;

  const ownerCpf = normalizeOptionalString(body.owner_cpf);
  if (ownerCpf !== undefined) data.owner_cpf = ownerCpf;

  // Owner signature is the R2 object key (path) or a legacy data URL
  if (body.owner_signature !== undefined) data.owner_signature = body.owner_signature || null;

  if (body.is_active !== undefined) data.is_active = body.is_active ? 1 : 0;

  if (Array.isArray(body.contacts)) {
    data.contacts = body.contacts.map((contact) => ({
      type: contact.type,
      value: String(contact.value).trim(),
      is_primary: contact.is_primary ? 1 : 0,
    }));
  }

  if (Array.isArray(body.addresses)) {
    data.addresses = body.addresses;
  }

  return data;
};

exports.getAllStores = async (req, res) => {
  try {
    const showInactive = req.query.showInactive === 'true';
    const stores = await Store.findAll(showInactive);

    res.status(200).json({
      status: 'success',
      results: stores.length,
      data: stores.map(withSignatureUrl),
    });
  } catch (error) {
    console.error('Erro ao buscar lojas:', error);
    res.status(500).json({ status: 'error', message: 'Erro interno ao listar lojas.' });
  }
};

exports.getStoreById = async (req, res) => {
  try {
    const { id } = req.params;
    const store = await Store.findById(id);

    if (!store) {
      return res.status(404).json({
        status: 'error',
        message: 'Loja não encontrada.',
      });
    }

    res.status(200).json({
      status: 'success',
      data: withSignatureUrl(store),
    });
  } catch (error) {
    console.error('Erro no Controller:', error);
    res.status(500).json({
      status: 'error',
      message: 'Erro interno ao buscar dados da loja.',
    });
  }
};

exports.createStore = async (req, res) => {
  try {
    const body = req.body || {};
    const errors = validateStorePayload(body);
    if (errors.length > 0) {
      return res.status(400).json({
        status: 'fail',
        message: errors.join(' '),
      });
    }

    const store = await Store.create(buildStoreData(body));

    res.status(201).json({
      status: 'success',
      message: 'Loja criada com sucesso.',
      data: withSignatureUrl(store),
    });
  } catch (error) {
    console.error('Erro ao criar loja:', error);
    res.status(500).json({ status: 'error', message: 'Erro interno ao criar loja.' });
  }
};

exports.updateStore = async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};

    const errors = validateStorePayload(body, { partial: true });
    if (errors.length > 0) {
      return res.status(400).json({
        status: 'fail',
        message: errors.join(' '),
      });
    }

    const existingStore = await Store.findById(id);
    const updated = await Store.update(id, buildStoreData(body));

    if (!updated) {
      return res.status(404).json({
        status: 'fail',
        message: 'Loja não encontrada.',
      });
    }

    const updatedStore = await Store.findById(id);

    if (existingStore && existingStore.owner_signature !== updatedStore?.owner_signature) {
      const oldKey = extractKey(existingStore.owner_signature);
      if (oldKey) await deleteFile(oldKey);
    }

    res.status(200).json({
      status: 'success',
      message: 'Loja atualizada com sucesso',
      data: withSignatureUrl(updatedStore),
    });
  } catch (error) {
    console.error('Erro ao atualizar loja:', error);
    res.status(500).json({ status: 'error', message: 'Erro interno ao atualizar loja.' });
  }
};

exports.toggleStoreActive = async (req, res) => {
  try {
    const { id } = req.params;

    const updated = await Store.toggleActive(id);

    if (!updated) {
      return res.status(404).json({
        status: 'fail',
        message: 'Loja não encontrada.',
      });
    }

    const updatedStore = await Store.findById(id);
    res.status(200).json({
      status: 'success',
      message: `Loja ${updatedStore.is_active ? 'ativada' : 'inativada'} com sucesso`,
      data: withSignatureUrl(updatedStore),
    });
  } catch (error) {
    console.error('Erro ao alternar status da loja:', error);
    res.status(500).json({ status: 'error', message: 'Erro interno ao alterar status da loja.' });
  }
};

// List stores available as transfer destinations (accessible by attendants).
// Returns all active stores except the one of the logged-in user.
exports.getStoresForTransfer = async (req, res) => {
  try {
    const userStoreId = req.user.storeId;

    if (!userStoreId) {
      return res.status(400).json({
        status: 'error',
        message: 'Usuário não possui loja associada.',
      });
    }

    const stores = await Store.findAllForTransfer(userStoreId);

    res.status(200).json({
      status: 'success',
      results: stores.length,
      data: stores,
    });
  } catch (error) {
    console.error('Erro ao buscar lojas para transferência:', error);
    res.status(500).json({ status: 'error', message: 'Erro interno ao listar lojas.' });
  }
};

module.exports = exports;
