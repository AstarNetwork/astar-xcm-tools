import { decodeAddress } from '@polkadot/util-crypto';
import BN from 'bn.js';
import { ChainApi } from '../api';
import { ExtrinsicPayload } from '../types';

const astarAssetToRelay = (
    api: ChainApi,
    amount: BN,
    assetId: string,
    paraId: number,
    recipientAccountId: string,
): ExtrinsicPayload => {
    if (assetId !== 'native') {
        throw new Error('You can only send native tokens to the relay chain');
    }

    // the relaychain that the current parachain is connected to
    const dest = {
        V1: {
            interior: 'Here',
            parents: new BN(1),
        },
    };
    // the account ID within the relaychain
    const beneficiary = {
        V1: {
            interior: {
                X1: {
                    AccountId32: {
                        network: 'Any',
                        id: decodeAddress(recipientAccountId),
                    },
                },
            },
            parents: new BN(0),
        },
    };
    // amount of fungible tokens to be transferred
    const assets = {
        V1: [
            {
                fun: {
                    Fungible: amount,
                },
                id: {
                    Concrete: {
                        interior: 'Here',
                        parents: new BN(0),
                    },
                },
            },
        ],
    };

    return api.buildTxCall('polkadotXcm', 'reserveWithdrawAssets', dest, beneficiary, assets, new BN(0));
};

// todo: write how to create the correct asset ID
const astarAssetToParaId = (
    api: ChainApi,
    amount: BN,
    assetId: string,
    paraId: number,
    recipientAccountId: string,
): ExtrinsicPayload => {
    // the target parachain the native asset will be sent to
    const dest = {
        V1: {
            interior: {
                X1: {
                    Parachain: new BN(paraId),
                },
            },
            parents: new BN(1),
        },
    };
    // the account ID within the relaychain
    const beneficiary = {
        V1: {
            interior: {
                X1: {
                    AccountId32: { // the account ID will be AccountKey20 for EVM based chains
                        network: 'Any',
                        id: decodeAddress(recipientAccountId),
                    },
                },
            },
            parents: new BN(0),
        },
    };

    // note that not all assets will be accepted by the other chain. There is no generic check for this yet

    const asset =
        assetId === 'native'
            ? {
                  Concrete: {
                      interior: 'Here',
                      parents: new BN(1),
                  },
              }
            : {
                  X2: {
                      Parachain: new BN(paraId),
                      GeneralKey: assetId, // todo: find a way to fetch the asset ID based on the symbol
                  },
              };

    // amount of fungible tokens to be transferred
    const assets = {
        V1: [
            {
                fun: {
                    Fungible: amount,
                },
                id: asset,
            },
        ],
    };
    return api.buildTxCall('polkadotXcm', 'reserveWithdrawAssets', dest, beneficiary, assets, new BN(0));
};

/**
 * Send a currency from Acala to a specified parachain.
 * @param api An api instance that is connected to the Acala node endpoint
 * @param amount The amount of token you wish to send
 * @param assetId The asset ID (or the symbol in this case) that should be transferred
 * @param paraId The paraId of the target chain
 * @param recipientAccountId The recipient's SS58 address
 * @returns 
 */
const acalaToParaId = (
    api: ChainApi,
    amount: BN,
    assetId: string,
    paraId: number,
    recipientAccountId: string,
): ExtrinsicPayload => {
    
    const currencyId = {
        Token: assetId, // todo: fix this so it can read from a generic asset ID instead of known symbols
    };

    // todo; define the args
    const dest = {
        V1: {
            parents: new BN(1),
            interior: {
                X2: [
                    {
                        Parachain: paraId,
                    },
                    {
                        AccountId32: {
                            network: 'Any',
                            id: decodeAddress(recipientAccountId),
                        },
                    },
                ],
            },
        },
    };

    // each XCM instruction is weighted to be 1_000_000_000 units of weight and for this op to execute
    // weight value of 5 * 10^9 is generally good
    const destWeight = (new BN(10).pow(new BN(9))).muln(5);

    return api.buildTxCall('xTokens', 'transferMultiAssets', currencyId, amount, dest, destWeight);
};

export const paraTransfers = [astarAssetToParaId, acalaToParaId];
