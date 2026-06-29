const Group =
  require("../models/Group");

function isPrivateParticipant(
  username,
  message
) {
  return message && (
    message.from === username ||
    message.to === username
  );
}

async function getGroupForMessage(message) {
  if (!message?.groupId) {
    return null;
  }

  return Group.findById(
    message.groupId
  );
}

function isGroupMember(
  username,
  group
) {
  return Boolean(
    group &&
    group.members &&
    group.members.includes(username)
  );
}

function isGroupAdmin(
  username,
  group
) {
  return Boolean(
    group &&
    (
      group.owner === username ||
      (group.admins || []).includes(username)
    )
  );
}

async function canAccessMessage({
  username,
  message
}) {
  if (!message) {
    return false;
  }

  if (message.chatType === "group") {
    const group =
      await getGroupForMessage(message);

    return isGroupMember(
      username,
      group
    );
  }

  return isPrivateParticipant(
    username,
    message
  );
}

async function canEditMessage({
  username,
  message
}) {
  if (!message) {
    return false;
  }

  if (message.from !== username) {
    return false;
  }

  if (message.chatType === "group") {
    return canAccessMessage({
      username,
      message
    });
  }

  return isPrivateParticipant(
    username,
    message
  );
}

async function canDeleteForEveryone({
  username,
  message
}) {
  if (!message) {
    return false;
  }

  if (message.chatType === "group") {
    const group =
      await getGroupForMessage(message);

    if (!isGroupMember(username, group)) {
      return false;
    }

    return message.from === username ||
      isGroupAdmin(username, group);
  }

  return isPrivateParticipant(username, message) &&
    message.from === username;
}

async function canPinMessage({
  username,
  message
}) {
  if (!message) {
    return false;
  }

  if (message.chatType === "group") {
    const group =
      await getGroupForMessage(message);

    return isGroupAdmin(
      username,
      group
    );
  }

  return isPrivateParticipant(
    username,
    message
  );
}

module.exports = {
  canAccessMessage,
  canEditMessage,
  canDeleteForEveryone,
  canPinMessage,
  isGroupAdmin,
  isGroupMember
};
