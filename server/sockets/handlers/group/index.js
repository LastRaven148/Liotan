const {
  registerJoinGroup
} = require("./joinGroup");

const registerGetGroupChat =
  require("./getGroupChat");

const registerSendGroupMessage =
  require("./sendGroupMessage");

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

  registerSendGroupMessage({
    io,
    socket
  });

}

module.exports =
  registerGroupHandlers;