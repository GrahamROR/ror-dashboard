"use strict";
const fs = require("node:fs"),
  path = require("node:path");
const E = require("./etsy.js"),
  MP = require("./contract.js");
function read(out) {
  const p = path.join(out, "manifest.json");
  if (!fs.existsSync(p)) return null;
  const m = JSON.parse(fs.readFileSync(p));
  if (!/^snapshots\/[a-f0-9]{64}\.json$/.test(m.file))
    throw Error("Invalid marketplace manifest");
  const bytes = fs.readFileSync(path.join(out, m.file));
  if (E.hash(bytes) !== m.sha256)
    throw Error("Marketplace snapshot integrity failure");
  const s = JSON.parse(bytes);
  if (s.schema !== MP.VERSION) throw Error("Marketplace schema mismatch");
  return s;
}
function atomic(file, value) {
  fs.writeFileSync(file + ".tmp", JSON.stringify(value, null, 2) + "\n");
  fs.renameSync(file + ".tmp", file);
}
function publish(out, snapshot) {
  fs.mkdirSync(path.join(out, "snapshots"), { recursive: true });
  const bytes = JSON.stringify(snapshot, null, 2) + "\n",
    id = E.hash(bytes),
    file = "snapshots/" + id + ".json";
  if (!fs.existsSync(path.join(out, file)))
    fs.writeFileSync(path.join(out, file), bytes, { flag: "wx" });
  atomic(path.join(out, "manifest.json"), {
    schema: MP.VERSION,
    file,
    sha256: id,
  });
  atomic(path.join(out, "refresh-status.json"), {
    status: "validated-historical",
    checked_at: new Date().toISOString(),
    mechanism: "paired CSV + independent period controls",
    live: false,
  });
  return id;
}
function refresh(out, work) {
  fs.mkdirSync(out, { recursive: true });
  try {
    const s = work(read(out));
    return publish(out, s);
  } catch (e) {
    atomic(path.join(out, "refresh-status.json"), {
      status: "failed",
      checked_at: new Date().toISOString(),
      reason:
        "Marketplace source validation/import failed; previous manifest retained.",
      live: false,
    });
    throw e;
  }
}
function rollback(out, id) {
  if (!/^[a-f0-9]{64}$/.test(id)) throw Error("Invalid rollback id");
  const bytes = fs.readFileSync(path.join(out, "snapshots", id + ".json"));
  if (E.hash(bytes) !== id) throw Error("Rollback integrity failure");
  const s = JSON.parse(bytes);
  if (s.schema !== MP.VERSION) throw Error("Rollback schema mismatch");
  atomic(path.join(out, "manifest.json"), {
    schema: MP.VERSION,
    file: "snapshots/" + id + ".json",
    sha256: id,
  });
  atomic(path.join(out, "refresh-status.json"), {
    status: "rolled-back",
    checked_at: new Date().toISOString(),
    live: false,
  });
  return id;
}
module.exports = { read, publish, refresh, rollback };
