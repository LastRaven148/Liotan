const {
  registerJoinGroup
} = require("./joinGroup");

const registerGetGroupChat =
  require("./getGroupChat");

function registerGroupHandlers({
  io,
  socket
}) {

  registerJoinGroup({
    socket
  });

  registerGetGroupChat({
    socket
  });

  socket.on("sendGroupMessage", (_data, ack) => {
    if (typeof ack === "function") ack({
      ok: false,
      error: "mls-v4-required",
      protocol: "mls-1.0"
    });
  });

}

module.exports =
  registerGroupHandlers;
