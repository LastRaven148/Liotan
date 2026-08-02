"use strict";

const {
  consistencyProof,
  latestCheckpoint
} = require("../../security/keyTransparency");

async function getTransparencyCheckpoint(_req, res, next) {
  try {
    return res.json({ checkpoint: await latestCheckpoint() });
  } catch (err) {
    return next(err);
  }
}

async function getTransparencyConsistency(req, res, next) {
  try {
    const from = Number(req.query.from);
    const to = req.query.to ? Number(req.query.to) : 0;
    return res.json(await consistencyProof(from, to));
  } catch (err) {
    if (err instanceof TypeError) return res.status(400).json({ error: err.message });
    return next(err);
  }
}

module.exports = {
  getTransparencyCheckpoint,
  getTransparencyConsistency
};
