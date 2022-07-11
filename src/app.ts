import { AstarApi, RelaychainApi, ChainAccount } from './api';
import BN from 'bn.js';
import endpoints from './config/endpoints.json';
import '@polkadot/types-augment';

export default async function app() {
    await astarRelaychainTx();

    //todo: test asset bridging from relaychain to parachain (UMP, DMP), test asset bridging from parachain to parachain (HRMP)
    //todo: test XC20 interaction and bridging
    //todo: create a parachain multiLocation abstraction (like a URL for parachains)

    // we need this to exit out of polkadot-js/api instance
    process.exit(0);
}

const astarRelaychainTx = async () => {
    // initialize the account
    const accountSecret = process.env.SUBSTRATE_MNEMONIC || '//Alice';
    const account = new ChainAccount(accountSecret, 'sr25519');

    // initialize the relaychain instance
    const relayApi = new RelaychainApi(endpoints.relaychain.polkadot);
    await relayApi.start();

    // initialize the parachain instance
    const paraApi = new AstarApi(endpoints.parachain.astar);
    await paraApi.start();
    
    console.log(`${paraApi.chainProperty.chainName} Parachain has Parachain ID ${paraApi.paraId}`);
    console.log(`${relayApi.chainProperty.chainName} Relaychain has parachains with the ID ${relayApi.parachains}`);

    // fetch a list of assets registered in the parachain (that has the assets pallet)
    const assets = await paraApi.fetchAssets();
    console.log(assets);

    // send the relaychain token
    const amount = new BN(10).pow(new BN(relayApi.chainProperty.tokenDecimals[0]));

}