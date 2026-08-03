"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const https = require("node:https");
const { Readable, Writable } = require("node:stream");
const test = require("node:test");

process.env.R2_MEDIA_ACCOUNT_ID = "test-account";
process.env.R2_MEDIA_ACCESS_KEY_ID = "test-access-key";
process.env.R2_MEDIA_SECRET_ACCESS_KEY = "test-secret-key";
process.env.R2_MEDIA_BUCKET = "test-private-bucket";
process.env.R2_MEDIA_ENDPOINT = "https://r2.example.test";

const { streamFromR2 } = require("../../utils/uploadToR2");

async function withR2Response({ chunks, statusCode = 200, headers }, run) {
  const originalRequest = https.request;
  https.request = (options, onResponse) => {
    const request = new EventEmitter();
    request.setTimeout = () => {};
    request.destroy = error => request.emit("error", error);
    request.end = () => {
      queueMicrotask(() => {
        const response = Readable.from(chunks);
        response.statusCode = statusCode;
        response.headers = headers;
        onResponse(response);
      });
    };
    return request;
  };

  try {
    return await run();
  } finally {
    https.request = originalRequest;
  }
}

function collectingTarget(chunks) {
  return new Writable({
    write(chunk, encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    }
  });
}

test("private R2 streaming enforces exact bytes and propagates target aborts", async t => {
  await t.test("returns the exact streamed byte count", async () => {
    const received = [];
    const target = collectingTarget(received);
    const result = await withR2Response({
      chunks: [Buffer.from("abc"), Buffer.from("def")],
      headers: { "content-length": "6" }
    }, () => streamFromR2("private/object", target, {
      expectedBytes: 6
    }));

    assert.equal(result.bytes, 6);
    assert.equal(Buffer.concat(received).toString("utf8"), "abc");
    await result.finalize();
    target.end();
    assert.equal(Buffer.concat(received).toString("utf8"), "abcdef");
  });

  await t.test("rejects a body larger than the reservation before forwarding it", async () => {
    const received = [];
    await assert.rejects(
      withR2Response({
        chunks: [Buffer.from("abcdefg")],
        headers: { "content-length": "7" }
      }, () => streamFromR2("private/object", collectingTarget(received), {
        expectedBytes: 6
      })),
      error => error?.code === "R2_STREAM_LENGTH_MISMATCH"
    );
    assert.equal(Buffer.concat(received).length, 0);
  });

  await t.test("rejects a body shorter than the reservation", async () => {
    const received = [];
    await assert.rejects(
      withR2Response({
        chunks: [Buffer.from("abcde")],
        headers: { "content-length": "5" }
      }, () => streamFromR2("private/object", collectingTarget(received), {
        expectedBytes: 6
      })),
      error => error?.code === "R2_STREAM_LENGTH_MISMATCH"
    );
    assert.equal(Buffer.concat(received).length, 0);
  });

  await t.test("rejects when the response target closes before completion", async () => {
    const target = new Writable({
      write(chunk, encoding, callback) {
        this.destroy();
        callback();
      }
    });
    await assert.rejects(
      withR2Response({
        chunks: [Buffer.from("abc"), Buffer.from("def")],
        headers: { "content-length": "6" }
      }, () => streamFromR2("private/object", target, {
        expectedBytes: 6
      })),
      error => error?.code === "ERR_STREAM_PREMATURE_CLOSE"
    );
  });
});
