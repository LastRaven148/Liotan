"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const express = require("express");
const request = require("supertest");
const attachmentUpload = require("../../config/attachmentUpload");
const uploadErrorHandler = require("../../middleware/uploadErrorHandler");

const validCiphertext = Buffer.concat([
  Buffer.from("LIOTANMLS1\0\0", "binary"),
  Buffer.alloc(32, 0x5a)
]);

function createApp() {
  const app = express();
  app.post("/upload", attachmentUpload.single("attachment"), (req, res) => {
    const uploadedPath = req.file?.path;
    if (uploadedPath) fs.unlinkSync(uploadedPath);
    res.json({ ok: true, fields: req.body, size: req.file?.size });
  });
  app.use(uploadErrorHandler);
  return app;
}

function validRequest(app) {
  return request(app)
    .post("/upload")
    .field("conversationId", "conversation")
    .field("bindingId", "binding")
    .field("ciphertextHash", "hash")
    .field("bytes", String(validCiphertext.length))
    .field("version", "mls-media-1")
    .attach("attachment", validCiphertext, {
      filename: "binding.liotanmedia",
      contentType: "application/octet-stream"
    });
}

test("accepts the exact five-field MLS multipart wire format", async () => {
  const response = await validRequest(createApp());
  assert.equal(response.status, 200, response.text);
  assert.equal(response.body.ok, true);
  assert.equal(Object.keys(response.body.fields).length, 5);
});

test("rejects an additional multipart field with a specific error", async () => {
  const response = await validRequest(createApp()).field("unexpected", "value");
  assert.equal(response.status, 400, response.text);
  assert.equal(response.body.error, "too many upload fields");
});
