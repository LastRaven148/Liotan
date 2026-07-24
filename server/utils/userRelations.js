const Group = require("../models/Group");
const CryptoConversation = require("../models/CryptoConversation");

function unique(list) {
  return [...new Set((list || []).map(item => String(item || "").trim()).filter(Boolean))];
}

async function getPrivateDialogUsernames(username) {
  const mlsConversations = await CryptoConversation.find({
    chatType: "private",
    lifecycleState: "active",
    participantUsernames: username
  }, "participantUsernames").lean();

  return unique([
    ...mlsConversations.flatMap(item => item.participantUsernames || []).filter(item => item !== username)
  ]);
}

async function getGroupRelatedUsernames(username) {
  const groups = await Group.find(
    { members: username },
    "members"
  ).lean();

  return groups.flatMap(group => group.members || []).filter(item => item !== username);
}

async function getRelatedUsernames(username) {
  if (!username) return [];
  const [privateUsers, groupUsers] = await Promise.all([
    getPrivateDialogUsernames(username),
    getGroupRelatedUsernames(username)
  ]);

  return unique([...privateUsers, ...groupUsers]);
}

async function usersAreRelated(userA, userB) {
  if (!userA || !userB || userA === userB) {
    return userA === userB;
  }

  const [groupExists, mlsExists] = await Promise.all([
    Group.exists({
      members: { $all: [userA, userB] }
    }),
    CryptoConversation.exists({
      lifecycleState: "active",
      participantUsernames: { $all: [userA, userB] }
    })
  ]);

  return Boolean(groupExists || mlsExists);
}

module.exports = {
  getRelatedUsernames,
  usersAreRelated
};
