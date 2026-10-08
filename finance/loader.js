// One integrity-checked loader shared by the existing dashboard components.
(function (root) {
  let pending;
  async function load() {
    if (!pending)
      pending = (async () => {
        const response = await fetch("finance/staging/manifest.json", {
          cache: "no-store",
        });
        if (!response.ok)
          throw Error("Verified Shopify financial manifest unavailable");
        const manifest = await response.json();
        if (!/^snapshots\/[a-f0-9]{64}\.json$/.test(manifest.file))
          throw Error("Invalid financial snapshot path");
        const r = await fetch("finance/staging/" + manifest.file);
        if (!r.ok)
          throw Error("Verified Shopify financial snapshot unavailable");
        const bytes = await r.arrayBuffer();
        const digest = Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
          (x) => x.toString(16).padStart(2, "0"),
        ).join("");
        if (digest !== manifest.sha256)
          throw Error("Financial snapshot integrity check failed");
        const data = JSON.parse(new TextDecoder().decode(bytes));
        if (
          data.id !== manifest.snapshot_id ||
          data.schema !== root.ShopifyFinance.VERSION
        )
          throw Error("Incompatible financial snapshot");
        let refreshStatus = null;
        try {
          const status = await fetch("finance/staging/refresh-status.json", {
            cache: "no-store",
          });
          if (status.ok) refreshStatus = await status.json();
        } catch {}
        return { ...data, refreshStatus };
      })();
    try {
      return await pending;
    } catch (e) {
      pending = null;
      throw e;
    }
  }
  root.ShopifyFinanceLoader = { load };
})(window);
