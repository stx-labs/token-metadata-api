import { parseContractIdentifiers } from '../../src/api/util/helpers';

describe('parseContractIdentifiers', () => {
  test('principal only defaults to token_number 1', () => {
    const result = parseContractIdentifiers([
      'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
    ]);
    expect(result).toEqual([
      { principal: 'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world', tokenNumber: 1 },
    ]);
  });

  test('principal with token number', () => {
    const result = parseContractIdentifiers([
      'SP497E7RX3233ATBS2AB9G4WTHB63X5PBSP5VGAQ.boomboxes-cycle-12:120',
    ]);
    expect(result).toEqual([
      {
        principal: 'SP497E7RX3233ATBS2AB9G4WTHB63X5PBSP5VGAQ.boomboxes-cycle-12',
        tokenNumber: 120,
      },
    ]);
  });

  test('invalid principals are skipped', () => {
    const result = parseContractIdentifiers(['not-a-principal', 'also.bad']);
    expect(result).toEqual([]);
  });

  test('invalid token numbers are skipped', () => {
    const result = parseContractIdentifiers([
      'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world:abc',
      'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world:0',
      'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world:-1',
      'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world:1.5',
    ]);
    expect(result).toEqual([]);
  });
});
