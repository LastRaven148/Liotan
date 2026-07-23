const CONTROL_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function initialMessageMutationState(envelope) {
  if (!envelope || envelope.kind !== "message" || !CONTROL_ID_RE.test(String(envelope.clientMessageId || ""))) {
    throw new Error("Mutation target must be an authenticated MLS message");
  }
  return {
    v: 2,
    revision: 0,
    lastMutationId: envelope.clientMessageId,
    deleted: false
  };
}

export function nextMutationBinding(targetEnvelope, currentState) {
  const state = currentState || initialMessageMutationState(targetEnvelope);
  if (state.deleted) throw new Error("Deleted MLS messages cannot be mutated");
  return {
    v: 2,
    targetSenderUsername: targetEnvelope.senderUsername,
    targetSenderClientId: targetEnvelope.senderClientId,
    targetSentAt: targetEnvelope.sentAt,
    revision: Number(state.revision) + 1,
    previousMutationId: state.lastMutationId
  };
}

export function applyMessageMutation(targetRecord, controlEnvelope, { requireV2 = true } = {}) {
  const target = targetRecord?.envelope;
  if (!target || target.kind !== "message" ||
    target.senderUsername !== controlEnvelope?.senderUsername) {
    throw new Error("Unauthorized MLS message mutation rejected");
  }
  const current = targetRecord.mutationState || initialMessageMutationState(target);
  if (current.deleted) throw new Error("Deleted MLS messages cannot be mutated");
  const binding = controlEnvelope.mutation;
  if (!binding) {
    if (requireV2) throw new Error("Unchained MLS message mutation rejected");
  } else if (
    binding.v !== 2 ||
    binding.targetSenderUsername !== target.senderUsername ||
    binding.targetSenderClientId !== target.senderClientId ||
    binding.targetSentAt !== target.sentAt ||
    binding.revision !== Number(current.revision) + 1 ||
    binding.previousMutationId !== current.lastMutationId
  ) {
    throw new Error("Stale, replayed, or forked MLS message mutation rejected");
  }
  const nextState = {
    v: 2,
    revision: Number(current.revision) + 1,
    lastMutationId: controlEnvelope.clientMessageId,
    deleted: controlEnvelope.kind === "delete"
  };
  const previousMaterialized = targetRecord.materialized || {
    text: target.text,
    deleted: false
  };
  return {
    ...targetRecord,
    mutationState: nextState,
    materialized: {
      text: controlEnvelope.kind === "edit" ? controlEnvelope.text : previousMaterialized.text,
      deleted: nextState.deleted
    }
  };
}

export function mutationUiMetadata(controlEnvelope) {
  return {
    mutationRevision: Number(controlEnvelope?.mutation?.revision || 0),
    lastMutationId: String(controlEnvelope?.clientMessageId || "")
  };
}
