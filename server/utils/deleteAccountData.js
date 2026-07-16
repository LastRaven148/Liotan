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
const E2EEConversation = require("../models/E2EEConversation");

const Session =
  require("../models/Session");

const UserSecurity =
  require("../models/UserSecurity");

const RegistrationCancel =
  require("../models/RegistrationCancel");
const PendingEmailChange =
  require("../models/PendingEmailChange");
const CryptoIdentity = require("../models/CryptoIdentity");
const CryptoDevice = require("../models/CryptoDevice");
const CryptoKeyPackage = require("../models/CryptoKeyPackage");
const CryptoConversation = require("../models/CryptoConversation");
const CryptoOperation = require("../models/CryptoOperation");
const CryptoEvent = require("../models/CryptoEvent");
const CryptoRequestNonce = require("../models/CryptoRequestNonce");
const CryptoDirectoryEntry = require("../models/CryptoDirectoryEntry");
const AttachmentUpload = require("../models/AttachmentUpload");

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
  }, { strict: true });

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
      storageType: message.attachment?.storageType,
      uploadId: message.attachment?.uploadId,
      mediaId: message.attachment?.mediaId
    }, { strict: true });
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

  const affectedGroups = await Group.find({ members: username });
  await CryptoConversation.updateMany(
    { chatType: "group", groupId: { $in: affectedGroups.map(group => group._id) } },
    { $set: { blockedForEpochChange: true } }
  );
  for (const group of affectedGroups) {
    group.members = group.members.filter(member => member !== username);
    group.admins = group.admins.filter(admin => admin !== username);
    group.e2eeVersion = (Number(group.e2eeVersion) || 1) + 1;
    if (group.owner === username && group.members.length) {
      group.owner = group.admins.find(admin => group.members.includes(admin)) || group.members[0];
      if (!group.admins.includes(group.owner)) group.admins.push(group.owner);
    }
    await group.save();
  }
  await CryptoConversation.updateMany(
    { chatType: "group", groupId: { $in: affectedGroups.map(group => group._id) } },
    {
      $pull: {
        participantUserIds: user._id,
        participantUsernames: username,
        adminUserIds: user._id
      },
      $set: { blockedForEpochChange: true }
    }
  );

  const emptyGroups =
    await Group.find({
      members: {
        $size: 0
      }
    });

  for (const group of emptyGroups) {
    const groupMessages =
      await Message.find({
        chatType: "group",
        groupId: group._id
      });

    for (const message of groupMessages) {
      await deleteUploadedFile({
        url: message.attachment?.url,
        storageKey: message.attachment?.storageKey,
        storageType: message.attachment?.storageType,
        uploadId: message.attachment?.uploadId,
        mediaId: message.attachment?.mediaId
      }, { strict: true });
    }

    await Message.deleteMany({
      chatType: "group",
      groupId: group._id
    });

    await deleteUploadedFile({
      url: group.avatar,
      storageKey: group.avatarStorageKey,
      storageType: group.avatarStorageType
    }, { strict: true });

    await E2EEKey.deleteMany({
      conversationId: `group:${group._id}`
    });

    const cryptoConversation = await CryptoConversation.findOne({ lookupKey: `group:${group._id}` }).lean();
    if (cryptoConversation) {
      const uploads = await AttachmentUpload.find({
        protocol: "mls-media-1",
        cryptoConversationId: cryptoConversation.conversationId
      }).lean();
      for (const upload of uploads) {
        await deleteUploadedFile({ storageKey: upload.storageKey, storageType: upload.storageType }, { strict: true });
      }
      await Promise.all([
        AttachmentUpload.deleteMany({ cryptoConversationId: cryptoConversation.conversationId }),
        CryptoEvent.deleteMany({ conversationId: cryptoConversation.conversationId }),
        CryptoOperation.deleteMany({ conversationId: cryptoConversation.conversationId }),
        CryptoConversation.deleteOne({ _id: cryptoConversation._id })
      ]);
    }
  }

  await Group.deleteMany({
    members: {
      $size: 0
    }
  });

  const legacyConversations = await E2EEConversation.find({ participants: username }, "conversationId").lean();
  const legacyConversationIds = legacyConversations.map(item => item.conversationId);
  await Promise.all([
    E2EEKey.deleteMany({
      $or: [
        { user: username },
        { conversationId: { $in: legacyConversationIds } }
      ]
    }),
    E2EEConversation.deleteMany({ conversationId: { $in: legacyConversationIds } })
  ]);

  // Old encrypted uploads may predate the protocol discriminator or may no
  // longer be referenced by a message. Account deletion must still remove
  // every object owned by the account instead of leaving ciphertext or avatar
  // remnants in R2 until a TTL happens to expire.
  const remainingOwnedUploads = await AttachmentUpload.find({ owner: username }).lean();
  for (const upload of remainingOwnedUploads) {
    await deleteUploadedFile({
      uploadId: upload.uploadId,
      mediaId: upload.uploadId,
      url: upload.url,
      mediaUrl: upload.mediaUrl,
      storageKey: upload.storageKey,
      storageType: upload.storageType
    }, { strict: true });
  }
  await AttachmentUpload.deleteMany({ owner: username });

  const cryptoDevices = await CryptoDevice.find({ userId: user._id }).lean();
  const cryptoClientIds = cryptoDevices.map(device => device.clientId);
  const cryptoConversations = await CryptoConversation.find({ participantUserIds: user._id }).lean();
  const privateConversations = cryptoConversations.filter(item => item.chatType === "private");
  const privateConversationIds = privateConversations.map(item => item.conversationId);
  const privateUploads = await AttachmentUpload.find({
    protocol: "mls-media-1",
    cryptoConversationId: { $in: privateConversationIds }
  }).lean();
  for (const upload of privateUploads) {
    await deleteUploadedFile({ storageKey: upload.storageKey, storageType: upload.storageType }, { strict: true });
  }
  await Promise.all([
    AttachmentUpload.deleteMany({ protocol: "mls-media-1", cryptoConversationId: { $in: privateConversationIds } }),
    CryptoEvent.deleteMany({ conversationId: { $in: privateConversationIds } }),
    CryptoOperation.deleteMany({
      $or: [
        { conversationId: { $in: privateConversationIds } },
        { requestedByUserId: user._id }
      ]
    }),
    CryptoConversation.deleteMany({ conversationId: { $in: privateConversationIds } }),
    CryptoConversation.updateMany(
      { chatType: "group", participantUserIds: user._id },
      { $set: { blockedForEpochChange: true } }
    ),
    CryptoKeyPackage.deleteMany({ userId: user._id }),
    CryptoRequestNonce.deleteMany({ clientId: { $in: cryptoClientIds } }),
    CryptoDirectoryEntry.deleteMany({ userId: user._id }),
    CryptoDevice.deleteMany({ userId: user._id }),
    CryptoIdentity.deleteOne({ userId: user._id })
  ]);

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

  await PendingEmailChange.deleteMany({
    $or: [
      { userId: user._id },
      { username },
      ...(user.emailHash
        ? [{ oldEmailHash: user.emailHash }, { newEmailHash: user.emailHash }]
        : [])
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
