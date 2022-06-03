import { ApiPromise, WsProvider } from '@polkadot/api';
import { SignerOptions } from '@polkadot/api/types';
import { ITuple } from '@polkadot/types/types';
import { Vec, u32, TypeRegistry } from '@polkadot/types';
import {
    DispatchError,
    VersionedXcm,
    MultiLocation,
    AssetMetadata,
    AssetDetails,
    MultiAsset,
    AssetBalance
} from '@polkadot/types/interfaces';
import { ChainAccount } from './Account';
import BN from 'bn.js';
import { ExtrinsicPayload, ChainProperty, ChainAsset } from '../types';
import { decodeAddress } from '@polkadot/util-crypto';
import Web3 from 'web3';

const AUTO_CONNECT_MS = 10_000; // [ms]

interface IXcmChain {
    xcmExecute: (message: VersionedXcm, maxWeight: BN) => ExtrinsicPayload;
    xcmSend: (dest: MultiLocation, message: VersionedXcm) => ExtrinsicPayload;
    xcmReserveTransferAsset: (
        dest: MultiLocation,
        beneficiary: MultiLocation,
        assets: MultiAsset,
        feeAssetItem: BN,
    ) => ExtrinsicPayload;
}

// WIP
interface IEvmChain {
    evmApiInst: Web3;
    start: () => Promise<void>;
}

class ChainApi {
    private _provider: WsProvider;
    private _api: ApiPromise;
    private _chainProperty: ChainProperty;
    private _registry: TypeRegistry;

    constructor(endpoint: string) {
        this._provider = new WsProvider(endpoint, AUTO_CONNECT_MS);

        console.log('connecting to ' + endpoint);
        this._api = new ApiPromise({
            provider: this._provider,
        });

        this._registry = new TypeRegistry();
    }

    public get apiInst() {
        if (!this._api) {
            throw new Error('The ApiPromise has not been initialized');
        }
        return this._api;
    }

    public get chainProperty() {
        return this._chainProperty;
    }

    public get typeRegistry() {
        return this._registry;
    }

    public async start() {
        this._api = await this._api.isReady;

        const chainProperties = await this._api.rpc.system.properties();

        const ss58Prefix = parseInt((await this._api.consts.system.ss58Prefix).toString() || '0');

        const tokenDecimals = chainProperties.tokenDecimals
            .unwrapOrDefault()
            .toArray()
            .map((i) => i.toNumber());

        const tokenSymbols = chainProperties.tokenSymbol
            .unwrapOrDefault()
            .toArray()
            .map((i) => i.toString());

        const chainName = (await this._api.rpc.system.chain()).toString();

        //console.log(`connected to ${chainName} with account ${this.account.address}`);

        this._chainProperty = {
            tokenSymbols,
            tokenDecimals,
            chainName,
            ss58Prefix,
        };
        //const ss58Format = chainProperties.ss58Format.unwrapOrDefault().toNumber();
        //this._keyring.setSS58Format(ss58Format);
    }

    public async getBlockHash(blockNumber: number) {
        return await this._api?.rpc.chain.getBlockHash(blockNumber);
    }

    public buildTxCall(extrinsic: string, method: string, ...args: any[]): ExtrinsicPayload {
        const ext = this._api?.tx[extrinsic][method](...args);
        if (ext) return ext;
        throw `Undefined extrinsic call ${extrinsic} with method ${method}`;
    }

    public buildStorageQuery(extrinsic: string, method: string, ...args: any[]) {
        const ext = this._api?.query[extrinsic][method](...args);
        if (ext) return ext;
        throw `Undefined storage query ${extrinsic} for method ${method}`;
    }

    public wrapBatchAll(txs: ExtrinsicPayload[]): ExtrinsicPayload {
        const ext = this._api?.tx.utility.batchAll(txs);
        if (ext) return ext;
        throw 'Undefined batch all';
    }

    public wrapSudo(tx: ExtrinsicPayload): ExtrinsicPayload {
        const ext = this._api?.tx.sudo.sudo(tx);
        if (ext) return ext;
        throw 'Undefined sudo';
    }

    public async nonce(account: ChainAccount): Promise<number | undefined> {
        return ((await this._api?.query.system.account(account.pair.address)) as any)?.nonce.toNumber();
    }

    public async getBalance(account: ChainAccount) {
        return ((await this._api?.query.system.account(account.pair.address)) as any).data.free.toBn() as BN;
    }

    public async signAndSend(signer: ChainAccount, tx: ExtrinsicPayload, options?: Partial<SignerOptions>) {
        // ensure that we automatically increment the nonce per transaction
        return await tx.signAndSend(signer.pair, { nonce: -1, ...options }, (result) => {
            // handle transaction errors
            result.events
                .filter((record): boolean => !!record.event && record.event.section !== 'democracy')
                .map(({ event: { data, method, section } }) => {
                    if (section === 'system' && method === 'ExtrinsicFailed') {
                        const [dispatchError] = data as unknown as ITuple<[DispatchError]>;
                        let message = dispatchError.type.toString();

                        if (dispatchError.isModule) {
                            try {
                                const mod = dispatchError.asModule;
                                const error = dispatchError.registry.findMetaError(mod);

                                message = `${error.section}.${error.name}`;
                            } catch (error) {
                                console.error(error);
                            }
                        } else if (dispatchError.isToken) {
                            message = `${dispatchError.type}.${dispatchError.asToken.type}`;
                        }

                        const errorMessage = `${section}.${method} ${message}`;
                        console.error(`error: ${errorMessage}`);

                        throw new Error(message);
                    } else if (section === 'utility' && method === 'BatchInterrupted') {
                        const anyData = data as any;
                        const error = anyData[1].registry.findMetaError(anyData[1].asModule);
                        let message = `${error.section}.${error.name}`;
                        console.error(`error: ${section}.${method} ${message}`);
                    }
                });
        });
    }
}

export class ParachainApi extends ChainApi implements IXcmChain {
    private _paraId: number;

    constructor(endpoint: string) {
        super(endpoint);
    }

    override async start() {
        await super.start();

        // obtain the parachain ID and parse it as Int
        this._paraId = parseInt((await this.buildStorageQuery('parachainInfo', 'parachainId')).toString());
    }

    public get paraId() {
        return this._paraId;
    }

    public xcmExecute(message: VersionedXcm, maxWeight: BN) {
        return this.buildTxCall('polkadotXcm', 'execute', message, maxWeight);
    }
    public xcmSend(dest: MultiLocation, message: VersionedXcm) {
        return this.buildTxCall('polkadotXcm', 'send', dest, message);
    }

    public xcmReserveTransferAsset(
        dest: MultiLocation,
        beneficiary: MultiLocation,
        assets: MultiAsset,
        feeAssetItem: BN,
    ) {
        return this.buildTxCall('polkadotXcm', 'reserveTransferAssets', dest, beneficiary, assets, feeAssetItem);
    }

    // note: this function is not working correctly!
    public transferToRelaychain(recipientAccountId: string, amount: BN) {
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
                            parents: new BN(1),
                        },
                    },
                },
            ],
        };

        return this.buildTxCall('polkadotXcm', 'reserveWithdrawAssets', dest, beneficiary, assets, new BN(0));
    }

    public async getAssetBalance(assetId: BN, account: ChainAccount) {
        const assetBalance = await this.buildStorageQuery('assets', 'account', assetId, account.pair.address);
        return assetBalance as AssetBalance;
    }

    public async fetchAssets() {
        // note that this function requires the chain to implement the Assets pallet

        // note: The asset ID will have different meanings depending on the range
        // 1 ~ 2^32-1 = User-defined assets. Anyone can register this assets on chain.
        // 2^32 ~ 2^64-1 = Statemine/Statemint assets map. This is a direct map of all the assets stored in the common-goods state chain.
        // 2^64 ~ 2^128-1 = Ecosystem assets like native assets on another parachain or other valuable tokens.
        // 2^128 ~ 1 = Relaychain native token (DOT or KSM).

        const assetsListRaw = await this.apiInst.query.assets.asset.entries();
        const assetMetadataListRaw = await this.apiInst.query.assets.metadata.entries();

        //const assetIds = assetIdsRaw.map((i) => i.toHuman() as string).flat().map((i) => i.replaceAll(',', ''));
        const assetInfos = assetsListRaw.map((i, index) => {
            const assetId = (i[0].toHuman() as string[])[0].replaceAll(',', '');
            //const assetId = i[0].toHuman() as any as AssetId;
            const assetInfo = i[1].toHuman() as any as AssetDetails;
            const metadata = assetMetadataListRaw[index][1].toHuman() as any as AssetMetadata;
            return {
                id: assetId,
                ...assetInfo,
                metadata,
            } as ChainAsset;
        });
        // convert the list into a string array of numbers without the comma and no nested entries

        return assetInfos;
    }
}

export class RelaychainApi extends ChainApi implements IXcmChain {
    private _parachains: number[];

    constructor(endpoint: string) {
        super(endpoint);
    }

    public get parachains() {
        return this._parachains;
    }

    override async start() {
        await super.start();

        const parachains = (await this.buildStorageQuery('paras', 'parachains')) as Vec<u32>;

        this._parachains = parachains.map((i) => i.toNumber());
        // check if the connected network implements xcmPallet
    }

    public transferToParachain(toPara: number, recipientAccountId: string, amount: BN) {
        // the target parachain connected to the current relaychain
        const dest = {
            V1: {
                interior: {
                    X1: {
                        Parachain: new BN(toPara),
                    },
                },
                parents: new BN(0),
            },
        };
        // the account ID within the destination parachain
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

        return this.buildTxCall('xcmPallet', 'reserveTransferAssets', dest, beneficiary, assets, new BN(0));
    }

    public xcmReserveTransferAsset(
        dest: MultiLocation,
        beneficiary: MultiLocation,
        assets: MultiAsset,
        feeAssetItem: BN,
    ) {
        return this.buildTxCall('xcmPallet', 'reserveTransferAssets', dest, beneficiary, assets, feeAssetItem);
    }

    public xcmExecute(message: VersionedXcm, maxWeight: BN) {
        return this.buildTxCall('xcmPallet', 'execute', message, maxWeight);
    }

    public xcmSend(dest: MultiLocation, message: VersionedXcm) {
        return this.buildTxCall('xcmPallet', 'send', dest, message);
    }
}
