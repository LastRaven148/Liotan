const jwt =
  require("jsonwebtoken");

const path =
  require("path");

const fs =
  require("fs/promises");

const Message =
  require("../models/Messages");

const User =
  require("../models/User");

const getChatId =
  require("../utils/getChatId");

const {
  isValidUsername,
  isValidMessage
} = require("../utils/validators");

const attachmentsDir =
  path.resolve(
    __dirname,
    "..",
    "uploads",
    "attachments"
  );

async function deleteAttachmentFile(
  attachment
) {

  try {

    const url =
      attachment?.url;

    if (
      !url ||
      !url.startsWith(
        "/uploads/attachments/"
      )
    ) {
      return;
    }

    const filename =
      path.basename(url);

    const filePath =
      path.resolve(
        attachmentsDir,
        filename
      );

    if (
      !filePath.startsWith(
        attachmentsDir + path.sep
      )
    ) {
      return;
    }

    await fs.unlink(filePath);

  } catch (err) {

    if (err.code !== "ENOENT") {
      console.error(
        "DELETE ATTACHMENT ERROR:",
        err.message
      );
    }

  }

}

async function deleteMessageAttachments(
  messages
) {

  for (const msg of messages) {
    await deleteAttachmentFile(
      msg.attachment
    );
  }

}

function emitToChatUsers({
  io,
  sender,
  receiver,
  event,
  payload
}) {

  if (sender === receiver) {
    io.to(sender).emit(
      event,
      payload
    );

    return;
  }

  io.to(sender).emit(
    event,
    payload
  );

  io.to(receiver).emit(
    event,
    payload
  );

}

async function markDeliveredForUser({
  io,
  username
}) {

  const messages =
    await Message.find({
      to: username,
      from: {
        $ne: username
      },
      $or: [
        { status: "sent" },
        {
          status: {
            $exists: false
          }
        }
      ]
    });

  if (!messages.length) {
    return;
  }

  const deliveredAt =
    new Date();

  await Message.updateMany(
    {
      _id: {
        $in:
          messages.map(
            msg => msg._id
          )
      }
    },
    {
      status: "delivered",
      deliveredAt
    }
  );

  for (const msg of messages) {

    emitToChatUsers({
      io,
      sender: msg.from,
      receiver: msg.to,
      event: "messageDelivered",
      payload: {
        chatId: msg.chatId,
        messageIds: [
          msg._id.toString()
        ],
        deliveredAt
      }
    });

  }

}

async function buildReplyTo({
  replyTo,
  chatId
}) {

  if (!replyTo?.messageId) {
    return undefined;
  }

  const original =
    await Message.findOne({
      _id: replyTo.messageId,
      chatId
    });

  if (!original) {
    return undefined;
  }

  return {
    messageId:
      original._id.toString(),
    from:
      original.from,
    text:
      original.text || "",
    attachmentType:
      original.attachment?.type || "",
    attachmentName:
      original.attachment?.name || ""
  };

}

function setupSocket(io) {

  io.use((socket, next) => {

    try {

      const token =
        socket.handshake.auth?.token;

      const decoded =
        jwt.verify(
          token,
          process.env.JWT_SECRET
        );

      if (
        !decoded.userId ||
        !decoded.username
      ) {
        return next(
          new Error("invalid token")
        );
      }

      socket.user =
        decoded;

      next();

    } catch (err) {

      console.log(
        "AUTH FAILED:",
        err.message
      );

      next(
        new Error("auth error")
      );

    }

  });

  const online =
    new Map();

  const typingTimers =
    new Map();

  function getTypingKey(
    from,
    to
  ) {

    return `${from}->${to}`;

  }

  function clearTyping({
    from,
    to
  }) {

    const key =
      getTypingKey(
        from,
        to
      );

    const timer =
      typingTimers.get(key);

    if (timer) {
      clearTimeout(timer);
      typingTimers.delete(key);
    }

  }

  function emitStopTyping({
    from,
    to
  }) {

    clearTyping({
      from,
      to
    });

    io.to(to).emit(
      "userStoppedTyping",
      {
        from
      }
    );

  }

  io.on(
    "connection",
    async (socket) => {

      const username =
        socket.user.username;

      socket.join(username);

      await User.updateOne(
        {
          username
        },
        {
          lastSeen: new Date()
        }
      );

      console.log(
        "CONNECTED:",
        username,
        socket.id
      );

      if (!online.has(username)) {
        online.set(
          username,
          new Set()
        );
      }

      online
        .get(username)
        .add(socket.id);

      io.emit(
        "onlineUsers",
        [...online.keys()]
      );

      try {

        await markDeliveredForUser({
          io,
          username
        });

      } catch (err) {
        console.error(err);
      }

      socket.on(
        "joinChat",
        (chatId) => {
          socket.join(chatId);
        }
      );

      socket.on(
        "typing",
        ({ to }) => {

          const from =
            socket.user.username;

          if (
            !isValidUsername(to) ||
            from === to
          ) {
            return;
          }

          const key =
            getTypingKey(
              from,
              to
            );

          clearTyping({
            from,
            to
          });

          io.to(to).emit(
            "userTyping",
            {
              from
            }
          );

          const timer =
            setTimeout(
              () => {

                typingTimers.delete(key);

                io.to(to).emit(
                  "userStoppedTyping",
                  {
                    from
                  }
                );

              },
              2500
            );

          typingTimers.set(
            key,
            timer
          );

        }
      );

      socket.on(
        "stopTyping",
        ({ to }) => {

          const from =
            socket.user.username;

          if (
            !isValidUsername(to) ||
            from === to
          ) {
            return;
          }

          emitStopTyping({
            from,
            to
          });

        }
      );

      socket.on(
        "getChat",
        async ({ user2 }) => {

          try {

            if (!isValidUsername(user2)) {
              return;
            }

            const user1 =
              socket.user.username;

            const chatId =
              getChatId(
                user1,
                user2
              );

            const msgs =
              await Message.find({
                chatId
              }).sort({
                createdAt: 1
              });

            socket.emit(
              "chatHistory",
              {
                chatId,
                msgs
              }
            );

          } catch (err) {
            console.error(err);
          }

        }
      );

      socket.on(
        "sendMessage",
        async (data) => {

          try {

            const sender =
              socket.user.username;

            const receiver =
              data.to;

            const hasText =
              isValidMessage(
                data.text
              );

            const hasAttachment =
              data.attachment &&
              data.attachment.url &&
              [
                "photo",
                "file"
              ].includes(
                data.attachment.type
              );

            if (
              !isValidUsername(receiver) ||
              (
                !hasText &&
                !hasAttachment
              )
            ) {
              return;
            }

            emitStopTyping({
              from: sender,
              to: receiver
            });

            const text =
              hasText
                ? data.text.trim()
                : "";

            const chatId =
              getChatId(
                sender,
                receiver
              );

            const isSavedMessages =
              sender === receiver;

            const receiverOnline =
              online.has(receiver);

            const now =
              new Date();

            const replyTo =
              await buildReplyTo({
                replyTo: data.replyTo,
                chatId
              });

            const msg =
              await Message.create({
                chatId,
                from: sender,
                to: receiver,
                text,
                replyTo,
                status:
                  isSavedMessages
                    ? "read"
                    : receiverOnline
                      ? "delivered"
                      : "sent",
                deliveredAt:
                  isSavedMessages ||
                  receiverOnline
                    ? now
                    : null,
                readAt:
                  isSavedMessages
                    ? now
                    : null,
                attachment:
                  hasAttachment
                    ? data.attachment
                    : undefined
              });

            emitToChatUsers({
              io,
              sender,
              receiver,
              event: "newMessage",
              payload: msg
            });

          } catch (err) {
            console.error(err);
          }

        }
      );

      socket.on(
        "markChatRead",
        async ({ user2 }) => {

          try {

            const reader =
              socket.user.username;

            if (
              !isValidUsername(user2) ||
              reader === user2
            ) {
              return;
            }

            const chatId =
              getChatId(
                reader,
                user2
              );

            const messages =
              await Message.find({
                chatId,
                from: user2,
                to: reader,
                status: {
                  $ne: "read"
                }
              });

            if (!messages.length) {
              return;
            }

            const readAt =
              new Date();

            const messageIds =
              messages.map(
                msg => msg._id.toString()
              );

            await Message.updateMany(
              {
                _id: {
                  $in: messageIds
                }
              },
              {
                status: "read",
                readAt,
                deliveredAt: readAt
              }
            );

            emitToChatUsers({
              io,
              sender: user2,
              receiver: reader,
              event: "messageRead",
              payload: {
                chatId,
                messageIds,
                readAt
              }
            });

          } catch (err) {
            console.error(err);
          }

        }
      );

      socket.on(
        "editMessage",
        async (data) => {

          try {

            const sender =
              socket.user.username;

            const messageId =
              data.messageId;

            if (
              !messageId ||
              !isValidMessage(data.text)
            ) {
              return;
            }

            const msg =
              await Message.findById(
                messageId
              );

            if (
              !msg ||
              msg.from !== sender
            ) {
              return;
            }

            msg.text =
              data.text.trim();

            msg.edited =
              true;

            msg.editedAt =
              new Date();

            await msg.save();

            emitToChatUsers({
              io,
              sender: msg.from,
              receiver: msg.to,
              event: "messageEdited",
              payload: msg
            });

          } catch (err) {
            console.error(err);
          }

        }
      );

      socket.on(
        "deleteMessage",
        async (data) => {

          try {

            const requester =
              socket.user.username;

            const messageId =
              data.messageId;

            if (!messageId) {
              return;
            }

            const msg =
              await Message.findById(
                messageId
              );

            if (!msg) {
              return;
            }

            const isParticipant =
              msg.from === requester ||
              msg.to === requester;

            if (!isParticipant) {
              return;
            }

            await deleteAttachmentFile(
              msg.attachment
            );

            await Message.deleteOne({
              _id: messageId
            });

            const latestMessage =
              await Message.findOne({
                chatId: msg.chatId
              }).sort({
                createdAt: -1
              });

            emitToChatUsers({
              io,
              sender: msg.from,
              receiver: msg.to,
              event: "messageDeleted",
              payload: {
                chatId: msg.chatId,
                messageId:
                  messageId.toString(),
                deletedMessage: msg,
                latestMessage
              }
            });

          } catch (err) {
            console.error(err);
          }

        }
      );

      socket.on(
        "deleteChat",
        async ({ user2 }) => {

          try {

            const user1 =
              socket.user.username;

            if (!isValidUsername(user2)) {
              return;
            }

            const chatId =
              getChatId(
                user1,
                user2
              );

            const messages =
              await Message.find({
                chatId
              });

            if (!messages.length) {
              return;
            }

            await deleteMessageAttachments(
              messages
            );

            await Message.deleteMany({
              chatId
            });

            emitToChatUsers({
              io,
              sender: user1,
              receiver: user2,
              event: "chatDeleted",
              payload: {
                chatId,
                user1,
                user2
              }
            });

          } catch (err) {
            console.error(err);
          }

        }
      );

      socket.on(
        "disconnect",
        () => {

          console.log(
            "DISCONNECTED:",
            username,
            socket.id
          );

          const sockets =
            online.get(username);

          if (sockets) {
            sockets.delete(
              socket.id
            );

            if (
              sockets.size === 0
            ) {

              online.delete(
                username
              );

              const lastSeen =
                new Date();

              User.updateOne(
                {
                  username
                },
                {
                  lastSeen
                }
              ).catch(console.error);

              io.emit(
                "userLastSeen",
                {
                  username,
                  lastSeen
                }
              );

            }
          }

          for (const key of typingTimers.keys()) {

            if (key.startsWith(`${username}->`)) {

              const to =
                key.split("->")[1];

              emitStopTyping({
                from: username,
                to
              });

            }

          }

          io.emit(
            "onlineUsers",
            [...online.keys()]
          );

        }
      );

    }
  );

}

module.exports =
  setupSocket;