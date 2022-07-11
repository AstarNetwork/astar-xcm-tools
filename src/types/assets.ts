import { AssetMetadata, AssetDetails } from '@polkadot/types/interfaces';

// todo: refactor this so is's a generic asset representation
export interface ChainAsset extends AssetDetails {
    id: string;
    metadata: AssetMetadata
}
