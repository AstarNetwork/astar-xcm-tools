import { ParachainApi, IAssetPallet } from './substrateApi';
import BN from 'bn.js';
import { ExtrinsicPayload, ChainProperty, ChainAsset } from '../types';
import {
    AssetMetadata,
    AssetDetails,
    AssetBalance,
} from '@polkadot/types/interfaces';
import { ChainAccount } from './account';

export class AstarApi extends ParachainApi implements IAssetPallet {
    constructor(endpoint: string) {
        super(endpoint);
    }

    public async getAssetBalance(assetId: BN, account: ChainAccount) {
        const assetBalance = await this.buildStorageQuery('assets', 'account', assetId, account.pair.address);
        return assetBalance as AssetBalance
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
