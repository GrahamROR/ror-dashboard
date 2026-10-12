// Read-only validation plus isolated rollback; never rolls back the published staging pointer.
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  assert = require("node:assert/strict");
const F = require("./contract"),
  B = require("./build-staging"),
  R = require("./rollback");
const root = process.argv[2] || B.ROOT,
  manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"))),
  snapshot = JSON.parse(fs.readFileSync(path.join(root, manifest.file))),
  status = JSON.parse(fs.readFileSync(path.join(root, "refresh-status.json")));
assert.equal(status.status, "success");
assert.equal(status.snapshot_id, snapshot.id);
assert.equal(
  B.hash(fs.readFileSync(path.join(root, manifest.file))),
  manifest.sha256,
);
let controls = 0;
for (const p of snapshot.periods) {
  const result = F.select(snapshot, p.start, p.end);
  for (const metric of F.ADDITIVE) assert.equal(result[metric], p[metric]);
  if (p.start !== p.end) controls++;
}
const interval = ["2025-08-01", "2026-07-31"],
  fy26 = F.select(snapshot, ...interval),
  native = snapshot.periods.find(
    (p) => p.start === interval[0] && p.end === interval[1],
  );
assert.ok(native);
for (const metric of F.ADDITIVE) assert.equal(fy26[metric], native[metric]);
const previous = JSON.parse(
    fs.readFileSync(
      path.join(root, "snapshots", manifest.previous_snapshot_id + ".json"),
    ),
  ),
  temp = fs.mkdtempSync(path.join(os.tmpdir(), "ror-live-rollback-"));
let rollback;
try {
  fs.mkdirSync(path.join(temp, "snapshots"));
  for (const s of [previous, snapshot])
    fs.copyFileSync(
      path.join(root, "snapshots", s.id + ".json"),
      path.join(temp, "snapshots", s.id + ".json"),
    );
  B.publish(snapshot, temp);
  R.rollback(previous.id, temp);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(temp, "manifest.json"))).snapshot_id,
    previous.id,
  );
  R.rollback(snapshot.id, temp);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(temp, "manifest.json"))).snapshot_id,
    snapshot.id,
  );
  for (const s of [previous, snapshot])
    assert.deepEqual(
      fs.readFileSync(path.join(temp, "snapshots", s.id + ".json")),
      fs.readFileSync(path.join(root, "snapshots", s.id + ".json")),
    );
  rollback = {
    passed: true,
    restored_previous: previous.id,
    restored_current: snapshot.id,
    isolated: true,
  };
} finally {
  fs.rmSync(temp, { recursive: true });
}
const report = {
  validated_at: new Date().toISOString(),
  snapshot_id: snapshot.id,
  coverage: snapshot.coverage,
  native_controls: controls,
  fy26: { before: F.select(previous, ...interval), corrected: fy26, native },
  rollback,
};
fs.writeFileSync(
  path.join(root, "validation.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    coverage: report.coverage,
    native_controls: controls,
    fy26_net: fy26.net_sales,
    fy26_orders: fy26.orders,
    rollback_passed: true,
  }),
);
