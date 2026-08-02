"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const moduleUrl = pathToFileURL(
  path.resolve(__dirname, "../../../client/src/crypto/mls/messageMutations.mjs")
).href;

function message() {
  return {
    v: 1,
    kind: "message",
    conversationId: "conversation",
    clientMessageId: "00000000-0000-4000-8000-000000000001",
    senderUsername: "alice",
    senderClientId: "alice:device-a",
    sentAt: "2026-07-23T00:00:00.000Z",
    text: "original"
  };
}

function control(kind, id, mutation, text = "") {
  return {
    v: 1,
    kind,
    conversationId: "conversation",
    clientMessageId: id,
    senderUsername: "alice",
    senderClientId: "alice:device-b",
    sentAt: "2026-07-23T00:01:00.000Z",
    targetMessageId: "00000000-0000-4000-8000-000000000001",
    text,
    mutation
  };
}

test("MLS edit/delete chain rejects authorization bypass, replay and forks", async () => {
  const {
    applyMessageMutation,
    initialMessageMutationState,
    nextMutationBinding
  } = await import(moduleUrl);
  const target = message();
  const original = {
    sequence: 1,
    envelope: target,
    mutationState: initialMessageMutationState(target),
    materialized: { text: target.text, deleted: false }
  };
  const editBinding = nextMutationBinding(target, original.mutationState);
  const edit = control(
    "edit",
    "00000000-0000-4000-8000-000000000002",
    editBinding,
    "edited"
  );
  const edited = applyMessageMutation(original, edit);
  assert.equal(edited.materialized.text, "edited");
  assert.equal(edited.mutationState.revision, 1);

  assert.throws(() => applyMessageMutation(edited, edit), /Stale, replayed, or forked/);
  const fork = control(
    "delete",
    "00000000-0000-4000-8000-000000000003",
    editBinding
  );
  assert.throws(() => applyMessageMutation(edited, fork), /Stale, replayed, or forked/);

  const deleteBinding = nextMutationBinding(target, edited.mutationState);
  const deleted = applyMessageMutation(
    edited,
    control("delete", "00000000-0000-4000-8000-000000000004", deleteBinding)
  );
  assert.equal(deleted.mutationState.deleted, true);
  assert.throws(
    () => nextMutationBinding(target, deleted.mutationState),
    /cannot be mutated/
  );

  const attacker = {
    ...control("edit", "00000000-0000-4000-8000-000000000005", editBinding, "attack"),
    senderUsername: "mallory"
  };
  assert.throws(() => applyMessageMutation(original, attacker), /Unauthorized/);
});

test("legacy MLS mutation is accepted only when the migration cutoff allows it", async () => {
  const { applyMessageMutation, initialMessageMutationState } = await import(moduleUrl);
  const target = message();
  const original = {
    sequence: 1,
    envelope: target,
    mutationState: initialMessageMutationState(target)
  };
  const legacy = control("edit", "00000000-0000-4000-8000-000000000006", undefined, "legacy");
  assert.throws(() => applyMessageMutation(original, legacy), /Unchained/);
  const migrated = applyMessageMutation(original, legacy, { requireV2: false });
  assert.equal(migrated.materialized.text, "legacy");
  assert.equal(migrated.mutationState.revision, 1);
});
