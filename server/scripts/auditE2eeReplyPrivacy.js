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

  const buildReplyTo = read("server/sockets/services/buildReplyTo.js");
  const privateSend = read("server/sockets/handlers/private/sendPrivateMessage.js");
  const groupSend = read("server/sockets/handlers/group/sendGroupMessage.js");
  const messageModel = read("server/models/Messages.js");
  const messageReply = read("client/src/components/chat/message/MessageReply.jsx");

  mustInclude(
    findings,
    "server/sockets/services/buildReplyTo.js",
    buildReplyTo,
    "currentContentMode",
    "critical",
    "Reply builder must know the content mode of the new message."
  );

  mustInclude(
    findings,
    "server/sockets/services/buildReplyTo.js",
    buildReplyTo,
    "currentContentMode === \"e2ee\"",
    "critical",
    "E2EE replies must not copy plaintext previews into MongoDB."
  );

  mustInclude(
    findings,
    "server/sockets/services/buildReplyTo.js",
    buildReplyTo,
    "originalContentMode === \"e2ee\"",
    "critical",
    "Replies to E2EE originals must not copy plaintext previews into MongoDB."
  );

  mustInclude(
    findings,
    "server/sockets/services/buildReplyTo.js",
    buildReplyTo,
    "attachmentName:\n      hidePreview\n        ? \"\"",
    "high",
    "E2EE reply previews must not persist attachment names."
  );

  mustInclude(
    findings,
    "server/sockets/handlers/private/sendPrivateMessage.js",
    privateSend,
    "currentContentMode: contentMode",
    "critical",
    "Private message send path must pass current content mode to reply builder."
  );

  mustInclude(
    findings,
    "server/sockets/handlers/group/sendGroupMessage.js",
    groupSend,
    "currentContentMode: contentMode",
    "critical",
    "Group message send path must pass current content mode to reply builder."
  );

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
