"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { CONFIRMATION, isConfirmed } = require("../../scripts/purgeAllAccountData");

test("full account purge requires the exact destructive confirmation", () => {
  const previous = process.env.LIOTAN_PURGE_CONFIRM;
  try {
    delete process.env.LIOTAN_PURGE_CONFIRM;
    assert.equal(isConfirmed(), false);
    process.env.LIOTAN_PURGE_CONFIRM = "yes";
    assert.equal(isConfirmed(), false);
    process.env.LIOTAN_PURGE_CONFIRM = `${CONFIRMATION} `;
    assert.equal(isConfirmed(), false);
    process.env.LIOTAN_PURGE_CONFIRM = CONFIRMATION;
    assert.equal(isConfirmed(), true);
  } finally {
    if (previous === undefined) delete process.env.LIOTAN_PURGE_CONFIRM;
    else process.env.LIOTAN_PURGE_CONFIRM = previous;
  }
});
