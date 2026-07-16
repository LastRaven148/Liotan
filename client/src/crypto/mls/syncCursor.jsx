export function reconcileSyncCursor({ checkpoint, localHint = 0, recipientHead = null }) {
  const processedSequence = Math.max(0, Number(checkpoint?.processedSequence) || 0);
  const trustedHead = Math.max(processedSequence, Number(checkpoint?.serverHead) || 0);
  const hint = Math.max(0, Number(localHint) || 0);
  if (recipientHead !== null) {
    const head = Math.max(0, Number(recipientHead) || 0);
    if (trustedHead > head || processedSequence > head) {
      const error = new Error("MLS recipient event log moved backwards");
      error.code = "mls-recipient-log-rollback";
      throw error;
    }
  }
  return {
    after: processedSequence,
    repairedLocalHint: hint !== processedSequence,
    untrustedHint: hint
  };
}

export function validateRecipientEventPage({ after, recipientHead, events }) {
  const head = Math.max(0, Number(recipientHead) || 0);
  let previous = Math.max(0, Number(after) || 0);
  for (const event of events || []) {
    const sequence = Number(event?.sequence);
    if (!Number.isSafeInteger(sequence) || sequence <= previous || sequence > head) {
      const error = new Error("MLS recipient event page is reordered or duplicated");
      error.code = "mls-recipient-page-invalid";
      throw error;
    }
    previous = sequence;
  }
  if (!(events || []).length && previous < head) {
    const error = new Error("MLS recipient event log has an unexpected gap");
    error.code = "mls-recipient-log-gap";
    throw error;
  }
  return previous;
}
