import { SubmittableExtrinsic } from '@polkadot/api/types';
import { ChainApi } from '../api';
import BN from 'bn.js';

export * from './assets';

export type ExtrinsicPayload = SubmittableExtrinsic<'promise'>;
export type KeypairType = 'ed25519' | 'sr25519' | 'ecdsa' | 'ethereum';

export interface ChainProperty {
    tokenSymbols: string[];
    tokenDecimals: number[];
    chainName: string;
    ss58Prefix: number;
}

export type TransferToPara = (
    api: ChainApi,
    amount: BN,
    assetId: string,
    paraId: number,
    recipientAccountId: string,
) => ExtrinsicPayload;
