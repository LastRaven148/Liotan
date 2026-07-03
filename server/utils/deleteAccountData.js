const User =
  require("../models/User");

const Message =
  require("../models/Messages");

const Group =
  require("../models/Group");

const EmailCode =
  require("../models/EmailCode");

const E2EEKey =
  require("../models/E2EEKey");

const Session =
  require("../models/Session");

const UserSecurity =
  require("../models/UserSecurity");

const RegistrationCancel =
  require("../models/RegistrationCancel");

const deleteUploadedFile =
  require("./deleteUploadedFile");

async function deleteAccountData(username) {
  const user =
    await User.findOne({
      username
    });

  if (!user) {
    return {
      ok: false,
      username,
      chatIds: []
    };
  }

  await deleteUploadedFile({
    url: user.avatar,
    storageKey: user.avatarStorageKey,
    storageType: user.avatarStorageType
  });

  const messages =
    await Message.find({
      $or: [
        { from: username },
        { to: username },
        { deletedFor: username }
      ]
    });

  const chatIds =
    [
      ...new Set(
        messages
          .map(message => message.chatId)
          .filter(Boolean)
      )
    ];

  for (const message of messages) {
    await deleteUploadedFile({
      url: message.attachment?.url,
      storageKey: message.attachment?.storageKey,
      storageType: message.attachment?.storageType
    });
  }

  await Message.deleteMany({
    $or: [
      { from: username },
      { to: username },
      { deletedFor: username }
    ]
  });

  await User.updateMany(
    {},
    {
      $pull: {
        pinnedChats: username,
        archivedChats: username
      }
    }
  );

  await Group.updateMany(
    {},
    {
      $pull: {
        members: username,
        admins: username
      }
    }
  );

  const emptyGroups =
    await Group.find({
      members: {
        $size: 0
      }
    });

  for (const group of emptyGroups) {
    await Message.deleteMany({
      chatType: "group",
      groupId: group._id
    });

    await E2EEKey.deleteMany({
      conversationId: `group:${group._id}`
    });
  }

  await Group.deleteMany({
    members: {
      $size: 0
    }
  });

  await E2EEKey.deleteMany({
    $or: [
      { user: username },
      { sender: username }
    ]
  });

  if (user.emailHash) {
    await EmailCode.deleteMany({
      emailHash: user.emailHash
    });
  }

  await Session.deleteMany({
    $or: [
      { userId: user._id },
      { username }
    ]
  });

  await UserSecurity.deleteMany({
    $or: [
      { userId: user._id },
      { username }
    ]
  });

  await RegistrationCancel.deleteMany({
    $or: [
      { userId: user._id },
      { username }
    ]
  });

  await User.deleteOne({
    username
  });

  return {
    ok: true,
    username,
    chatIds,
    emailHash: user.emailHash || ""
  };
}

module.exports =
  deleteAccountData;
