const db = require('../src/config/database');
const ContractModel = require('../src/models/ContractModel');

jest.mock('../src/config/database', () => ({
  query: jest.fn(),
  getConnection: jest.fn(),
}));

describe('Sequential contract numbers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts at 0001 when there is no contract for the prefix/year', async () => {
    const connection = { query: jest.fn().mockResolvedValue([[]]) };

    const number = await ContractModel.generateContractNumber({
      prefix: 'MADRI',
      year: 2026,
      connection,
    });

    expect(number).toBe('MADRI-2026-0001');
    expect(connection.query).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE'), [
      'MADRI-2026-%',
    ]);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('increments and zero-pads the last number for the prefix/year', async () => {
    const connection = {
      query: jest.fn().mockResolvedValue([[{ contract_number: 'MADRI-2026-0042' }]]),
    };

    const number = await ContractModel.generateContractNumber({
      prefix: 'MADRI',
      year: 2026,
      connection,
    });

    expect(number).toBe('MADRI-2026-0043');
  });

  it('keeps counting from 9999 without reusing numbers', async () => {
    const connection = {
      query: jest.fn().mockResolvedValue([[{ contract_number: 'MADRI-2026-9999' }]]),
    };

    await expect(
      ContractModel.generateContractNumber({ prefix: 'MADRI', year: 2026, connection }),
    ).resolves.toBe('MADRI-2026-10000');
  });
});
