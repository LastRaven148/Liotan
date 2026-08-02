const fs = require("fs");
const path = require("path");

const rootDir = path.join(__dirname, "..", "..");

function read(file) {
  return fs.readFileSync(path.join(rootDir, file), "utf8");
}

function addFinding(findings, severity, file, message) {
  findings.push({ severity, file, message });
}

function mustInclude(findings, file, content, token, severity, message) {
  if (!content.includes(token)) {
    addFinding(findings, severity, file, message);
  }
}

function main() {
  const findings = [];

  const privateHandler = read("server/sockets/handlers/private/index.js");
  const groupHandler = read("server/sockets/handlers/group/index.js");
  const attachmentRoutes = read("server/routes/attachmentRoutes.js");
  const groupMessageRoutes = read("server/routes/groupMessageRoutes.js");
  const messageModel = read("server/models/Messages.js");
  const messageReply = read("client/src/components/chat/message/MessageReply.jsx");

  mustInclude(findings, "server/sockets/handlers/private/index.js", privateHandler,
    "mls-v4-required", "critical", "Legacy private writes must be rejected.");

  mustInclude(findings, "server/sockets/handlers/group/index.js", groupHandler,
    "mls-v4-required", "critical", "Legacy group writes must be rejected.");
  mustInclude(findings, "server/routes/attachmentRoutes.js", attachmentRoutes,
    "legacyMediaGone", "critical", "Legacy attachment reads and writes must be permanently gone.");
  mustInclude(findings, "server/routes/groupMessageRoutes.js", groupMessageRoutes,
    "legacyGroupHistoryGone", "critical", "Legacy group history reads must be permanently gone.");

  if (/Message\.(create|insertMany)|new Message/.test(
    privateHandler + groupHandler + attachmentRoutes + groupMessageRoutes
  )) {
    addFinding(findings, "critical", "server/sockets/handlers", "Legacy send handlers must not persist messages.");
  }

  for (const removedDuplicate of [
    "server/sockets/handlers/private/sendPrivateMessage.js",
    "server/sockets/handlers/group/sendGroupMessage.js",
    "server/sockets/services/buildReplyTo.js",
    "server/sockets/services/markDeliveredForUser.js",
    "server/sockets/services/serializeMessage.js",
    "server/controllers/attachmentController.js",
    "server/controllers/groupMessageController.js"
  ]) {
    if (fs.existsSync(path.join(rootDir, removedDuplicate))) {
      addFinding(findings, "high", removedDuplicate, "Dead duplicate legacy write handler must stay removed.");
    }
  }

  mustInclude(
    findings,
    "server/models/Messages.js",
    messageModel,
    "previewMode",
    "medium",
    "Reply preview mode should be stored explicitly for encrypted placeholders."
  );

  mustInclude(
    findings,
    "client/src/components/chat/message/MessageReply.jsx",
    messageReply,
    "replyTo.previewMode === \"encrypted\"",
    "medium",
    "Client should render encrypted reply placeholders without relying on plaintext."
  );

  const ok = findings.length === 0;
  console.log(JSON.stringify({ ok, findings }, null, 2));

  if (!ok) {
    process.exitCode = 1;
  }
}

main();
