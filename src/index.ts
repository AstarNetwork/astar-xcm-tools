#!/usr/bin/env ts-node

import app from './app';


(async () => {
    await app();
    
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
