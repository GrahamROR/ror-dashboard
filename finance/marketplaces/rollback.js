// Changes only the dashboard staging pointer to a retained, integrity-checked snapshot.
"use strict";
const S = require("./store.js");
const [out, id] = process.argv.slice(2);
if (!out || !id)
  throw Error(
    "Usage: node finance/marketplaces/rollback.js STAGING_DIRECTORY SNAPSHOT_SHA256",
  );
console.log(JSON.stringify({ restored: S.rollback(out, id) }));
