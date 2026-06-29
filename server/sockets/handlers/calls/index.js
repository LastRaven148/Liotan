const User =
  require("../../../models/User");

const {
  isValidUsername
} = require("../../../utils/validators");

const {
  getCallRouteId,
  isValidCallRouteId,
  sanitizeCallId,
  sanitizeSignalPayload
} = require("../../../utils/callPrivacy");

const {
  CALL_POLICY
} = require("../../../utils/realtimeSecurityPolicy");

function getTargetRoute({
  toRoute,
  to
}) {
  if (isValidCallRouteId(toRoute)) {
    return toRoute;
  }

  if (isValidUsername(to)) {
    return getCallRouteId(to);
  }

  return null;
}

async function canRouteLegacyTarget({
  from,
  to
}) {
  if (!to) {
    return true;
  }

  if (
    !isValidUsername(to) ||
    to === from
  ) {
    return false;
  }

  return Boolean(
    await User.exists({
      username: to,
      emailVerified: true
    })
  );
}

function emitCallSignal({
  io,
  routeId,
  event,
  payload
}) {
  if (!routeId) {
    return;
  }

  io.to(`call:${routeId}`).emit(
    event,
    payload
  );
}

function registerCallHandlers({
  io,
  socket
}) {
  socket.on(
    "callOffer",
    async ({ toRoute, to, callId, offer, media = "audio" }) => {
      const from =
        socket.user.username;

      const routeId =
        getTargetRoute({ toRoute, to });

      const safeCallId =
        sanitizeCallId(callId);

      const safeOffer =
        sanitizeSignalPayload(offer);

      if (
        !routeId ||
        !safeCallId ||
        !safeOffer ||
        !(await canRouteLegacyTarget({ from, to }))
      ) {
        return;
      }

      emitCallSignal({
        io,
        routeId,
        event: "callOffer",
        payload: {
          fromRoute: getCallRouteId(from),
          callId: safeCallId,
          offer: safeOffer,
          media:
            media === "video"
              ? "video"
              : "audio",
          e2eeRequired: true,
          recording: false,
          serverRecording: false,
          ephemeral: true,
          noPersistence: true,
          policy: CALL_POLICY
        }
      });
    }
  );

  socket.on(
    "callAnswer",
    async ({ toRoute, to, callId, answer }) => {
      const from =
        socket.user.username;

      const routeId =
        getTargetRoute({ toRoute, to });

      const safeCallId =
        sanitizeCallId(callId);

      const safeAnswer =
        sanitizeSignalPayload(answer);

      if (
        !routeId ||
        !safeCallId ||
        !safeAnswer ||
        !(await canRouteLegacyTarget({ from, to }))
      ) {
        return;
      }

      emitCallSignal({
        io,
        routeId,
        event: "callAnswer",
        payload: {
          fromRoute: getCallRouteId(from),
          callId: safeCallId,
          answer: safeAnswer,
          e2eeRequired: true,
          ephemeral: true,
          noPersistence: true,
          policy: CALL_POLICY
        }
      });
    }
  );

  socket.on(
    "callIceCandidate",
    async ({ toRoute, to, callId, candidate }) => {
      const from =
        socket.user.username;

      const routeId =
        getTargetRoute({ toRoute, to });

      const safeCallId =
        sanitizeCallId(callId);

      const safeCandidate =
        sanitizeSignalPayload(candidate, 32768);

      if (
        !routeId ||
        !safeCallId ||
        !safeCandidate ||
        !(await canRouteLegacyTarget({ from, to }))
      ) {
        return;
      }

      emitCallSignal({
        io,
        routeId,
        event: "callIceCandidate",
        payload: {
          fromRoute: getCallRouteId(from),
          callId: safeCallId,
          candidate: safeCandidate,
          ephemeral: true,
          noPersistence: true,
          policy: CALL_POLICY
        }
      });
    }
  );

  socket.on(
    "callEnd",
    async ({ toRoute, to, callId, reason = "ended" }) => {
      const from =
        socket.user.username;

      const routeId =
        getTargetRoute({ toRoute, to });

      const safeCallId =
        sanitizeCallId(callId);

      if (
        !routeId ||
        !safeCallId ||
        !(await canRouteLegacyTarget({ from, to }))
      ) {
        return;
      }

      emitCallSignal({
        io,
        routeId,
        event: "callEnd",
        payload: {
          fromRoute: getCallRouteId(from),
          callId: safeCallId,
          reason:
            typeof reason === "string" && reason.length <= 32
              ? reason
              : "ended",
          ephemeral: true,
          noPersistence: true,
          policy: CALL_POLICY
        }
      });
    }
  );
}

module.exports =
  registerCallHandlers;
