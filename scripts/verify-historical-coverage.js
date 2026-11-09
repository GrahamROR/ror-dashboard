'use strict';
require('../finance/marketplaces/historical-count-check').run().then(proof=>console.log(JSON.stringify(proof))).catch(()=>{console.error('Historical API count check failed; public bundle was not promoted and live financial data was not changed.');process.exitCode=1;});
