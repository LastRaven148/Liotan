const {
  isValidUsername
} = require("../../../utils/validators");

function safePayload(value) {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return null;
  }

  const text =
    JSON.stringify(value);

  if (text.length > 65536) {
    return null;
  }

  return value;
}

function registerCallHandlers({
  io,
  socket
}) {
  socket.on(
    "callOffer",
    ({ to, callId, offer }) => {
      const from =
        socket.user.username;

      if (
        !isValidUsername(to) ||
        to === from ||
        typeof callId !== "string" ||
        callId.length > 128
      ) {
        return;
      }

      const safeOffer =
        safePayload(offer);

      if (!safeOffer) {
        return;
      }

      io.to(to).emit(
        "callOffer",
        {
          from,
          callId,
          offer: safeOffer,
          e2eeRequired: true,
          recording: false
        }
      );
    }
  );

  socket.on(
    "callAnswer",
    ({ to, callId, answer }) => {
      const from =
        socket.user.username;

      if (
        !isValidUsername(to) ||
        to === from ||
        typeof callId !== "string" ||
        callId.length > 128
      ) {
        return;
      }

      const safeAnswer =
        safePayload(answer);

      if (!safeAnswer) {
        return;
      }

      io.to(to).emit(
        "callAnswer",
        {
          from,
          callId,
          answer: safeAnswer,
          e2eeRequired: true
        }
      );
    }
  );

  socket.on(
    "callIceCandidate",
    ({ to, callId, candidate }) => {
      const from =
        socket.user.username;

      if (
        !isValidUsername(to) ||
        to === from ||
        typeof callId !== "string" ||
        callId.length > 128
      ) {
        return;
      }

      const safeCandidate =
        safePayload(candidate);

      if (!safeCandidate) {
        return;
      }

      io.to(to).emit(
        "callIceCandidate",
        {
          from,
          callId,
          candidate: safeCandidate
        }
      );
    }
  );

  socket.on(
    "callEnd",
    ({ to, callId }) => {
      const from =
        socket.user.username;

      if (
        !isValidUsername(to) ||
        to === from ||
        typeof callId !== "string" ||
        callId.length > 128
      ) {
        return;
      }

      io.to(to).emit(
        "callEnd",
        {
          from,
          callId
        }
      );
    }
  );
}

module.exports =
  registerCallHandlers;
