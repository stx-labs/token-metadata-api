import {
  bufferCV,
  cvToHex,
  intCV,
  listCV,
  principalCV,
  stringAsciiCV,
  tupleCV,
  uintCV,
} from '@stacks/transactions';
import { getContractLogMetadataUpdateNotification } from '../../src/token-processor/util/sip-validation';
import { StacksCoreContractEvent } from '../../src/stacks-core/schemas';
import { DecodedStacksTransaction } from '../../src/stacks-core/stacks-core-block-processor';

describe('SIP Validation', () => {
  test('SIP-019 FT notification', () => {
    const address = 'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS';
    const contractId = `${address}.hello-world`;

    // Valid FT notification.
    const tuple1 = tupleCV({
      notification: bufferCV(Buffer.from('token-metadata-update')),
      payload: tupleCV({
        'token-class': bufferCV(Buffer.from('ft')),
        'contract-id': principalCV(contractId),
      }),
    });
    const tx = {
      decoded: {
        auth: {
          origin_condition: {
            signer: {
              address: address,
            },
          },
        },
      },
    } as DecodedStacksTransaction;
    const event1: StacksCoreContractEvent = {
      txid: '0x123',
      event_index: 0,
      type: 'contract_event',
      contract_event: {
        contract_identifier: contractId,
        topic: 'print',
        raw_value: cvToHex(tuple1),
      },
    };
    const notification1 = getContractLogMetadataUpdateNotification(tx, event1);
    expect(notification1).not.toBeUndefined();
    expect(notification1?.contract_id).toBe(contractId);
    expect(notification1?.token_class).toBe('ft');
    expect(notification1?.token_ids).toBeUndefined();
  });

  test('SIP-019 notification ownership', () => {
    const address = 'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS';
    const contractId = `${address}.hello-world`;

    // Valid FT notification.
    const tuple1 = tupleCV({
      notification: bufferCV(Buffer.from('token-metadata-update')),
      payload: tupleCV({
        'token-class': bufferCV(Buffer.from('ft')),
        'contract-id': bufferCV(Buffer.from(contractId)),
      }),
    });

    // Invalid notification senders
    const tx2 = {
      decoded: {
        auth: {
          origin_condition: {
            signer: {
              address: 'SPCAQ4RCYJ30BYKJ9Z6BRGS3169PWZNN89NH4MCS',
            },
          },
        },
      },
    } as DecodedStacksTransaction;
    const event2: StacksCoreContractEvent = {
      txid: '0x123',
      event_index: 0,
      type: 'contract_event',
      contract_event: {
        contract_identifier: 'SPCAQ4RCYJ30BYKJ9Z6BRGS3169PWZNN89NH4MCS.hic-1',
        topic: 'print',
        raw_value: cvToHex(tuple1),
      },
    };
    const notification2 = getContractLogMetadataUpdateNotification(tx2, event2);
    expect(notification2).toBeUndefined();

    // Sent by the contract owner
    const tx3 = {
      decoded: {
        auth: {
          origin_condition: {
            signer: {
              address,
            },
          },
        },
      },
    } as DecodedStacksTransaction;
    const event3: StacksCoreContractEvent = {
      txid: '0x123',
      event_index: 0,
      type: 'contract_event',
      contract_event: {
        contract_identifier: 'SPCAQ4RCYJ30BYKJ9Z6BRGS3169PWZNN89NH4MCS.hic-1',
        topic: 'print',
        raw_value: cvToHex(tuple1),
      },
    };
    const notification3 = getContractLogMetadataUpdateNotification(tx3, event3);
    expect(notification3).not.toBeUndefined();
    expect(notification3?.contract_id).toBe(contractId);
    expect(notification3?.token_class).toBe('ft');
    expect(notification3?.token_ids).toBeUndefined();

    // Emitted by the correct contract
    const tx4 = {
      decoded: {
        auth: {
          origin_condition: {
            signer: {
              address: 'SPCAQ4RCYJ30BYKJ9Z6BRGS3169PWZNN89NH4MCS',
            },
          },
        },
      },
    } as DecodedStacksTransaction;
    const event4: StacksCoreContractEvent = {
      txid: '0x123',
      event_index: 0,
      type: 'contract_event',
      contract_event: {
        contract_identifier: contractId,
        topic: 'print',
        raw_value: cvToHex(tuple1),
      },
    };
    const notification4 = getContractLogMetadataUpdateNotification(tx4, event4);
    expect(notification4).not.toBeUndefined();
    expect(notification4?.contract_id).toBe(contractId);
    expect(notification4?.token_class).toBe('ft');
    expect(notification4?.token_ids).toBeUndefined();
  });

  test('SIP-019 NFT notification', () => {
    const address = 'SP3XA0MBJ3TD14HRAT0ZP65N933XMG6E6QAS00CTW';
    const contractId = `${address}.fine-art-exhibition-v1`;

    // Taken from tx 0xfc81a8c30025d7135d4313ea746831de1c7794478d4e0d23ef76970ee071cf20
    const tx1 = {
      decoded: {
        auth: {
          origin_condition: {
            signer: {
              address,
            },
          },
        },
      },
    } as DecodedStacksTransaction;
    const event1: StacksCoreContractEvent = {
      txid: '0x123',
      event_index: 0,
      type: 'contract_event',
      contract_event: {
        contract_identifier: contractId,
        topic: 'print',
        raw_value:
          '0x0c000000020c6e6f74696669636174696f6e0d00000015746f6b656e2d6d657461646174612d757064617465077061796c6f61640c000000020b636f6e74726163742d69640616faa051721e9a12470ad03f6316a918fb4819c6ba1666696e652d6172742d65786869626974696f6e2d76310b746f6b656e2d636c6173730d000000036e6674',
      },
    };
    const notification1 = getContractLogMetadataUpdateNotification(tx1, event1);
    expect(notification1).not.toBeUndefined();
    expect(notification1?.contract_id).toBe(contractId);
    expect(notification1?.token_class).toBe('nft');
    expect(notification1?.token_ids).toBeUndefined();

    // Add token IDs
    const tuple2 = tupleCV({
      notification: bufferCV(Buffer.from('token-metadata-update')),
      payload: tupleCV({
        'token-class': bufferCV(Buffer.from('nft')),
        'contract-id': bufferCV(Buffer.from(contractId)),
        'token-ids': listCV([intCV(1), intCV(2)]),
      }),
    });
    const event2: StacksCoreContractEvent = {
      txid: '0x123',
      event_index: 0,
      type: 'contract_event',
      contract_event: {
        contract_identifier: contractId,
        topic: 'print',
        raw_value: cvToHex(tuple2),
      },
    };
    const notification2 = getContractLogMetadataUpdateNotification(tx1, event2);
    expect(notification2).not.toBeUndefined();
    expect(notification2?.contract_id).toBe(contractId);
    expect(notification2?.token_class).toBe('nft');
    expect(notification2?.token_ids).toEqual([1n, 2n]);
  });

  test('SIP-019 notification with update mode', () => {
    const address = 'SP3XA0MBJ3TD14HRAT0ZP65N933XMG6E6QAS00CTW';
    const contractId = `${address}.fine-art-exhibition-v1`;

    // Add token IDs
    const tuple = tupleCV({
      notification: bufferCV(Buffer.from('token-metadata-update')),
      payload: tupleCV({
        'token-class': bufferCV(Buffer.from('nft')),
        'contract-id': bufferCV(Buffer.from(contractId)),
        'token-ids': listCV([intCV(1), intCV(2)]),
        'update-mode': stringAsciiCV('dynamic'),
        ttl: uintCV(9999),
      }),
    });
    const event: StacksCoreContractEvent = {
      txid: '0x123',
      event_index: 0,
      type: 'contract_event',
      contract_event: {
        contract_identifier: contractId,
        topic: 'print',
        raw_value: cvToHex(tuple),
      },
    };
    const tx = {
      decoded: {
        auth: {
          origin_condition: {
            signer: {
              address,
            },
          },
        },
      },
    } as DecodedStacksTransaction;
    const notification = getContractLogMetadataUpdateNotification(tx, event);
    expect(notification).not.toBeUndefined();
    expect(notification?.contract_id).toBe(contractId);
    expect(notification?.token_class).toBe('nft');
    expect(notification?.token_ids).toEqual([1n, 2n]);
    expect(notification?.update_mode).toBe('dynamic');
    expect(notification?.ttl).toBe(9999n);
  });
});
