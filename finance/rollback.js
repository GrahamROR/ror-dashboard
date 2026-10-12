// Select an existing immutable STAGING snapshot. Existing dashboard readers share this validated pointer; no production data is overwritten.
const fs = require("node:fs"),
  path = require("node:path");
const { ROOT, hash, publish } = require("./build-staging");
function rollback(id, root = ROOT) {
  if (!/^[a-f0-9]{64}$/.test(id)) throw Error("Invalid snapshot ID");
  const file = path.join(root, "snapshots", id + ".json");
  const snapshot = JSON.parse(fs.readFileSync(file));
  const { id: stored, ...body } = snapshot;
  if (stored !== id || hash(JSON.stringify(body)) !== id)
    throw Error("Snapshot identity mismatch");
  return publish(snapshot, root);
}
if (require.main === module)
  console.log(JSON.stringify(rollback(process.argv[2])));
module.exports = { rollback };
