'use strict';
// Builds aggregate bundle files locally; normal PR review/CI handles publication.
try{console.log(JSON.stringify(require('../finance/historical/bundle').create()));}
catch{console.error('Historical aggregate bundle validation failed; no live financial data changed.');process.exitCode=1;}
