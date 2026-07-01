const Message = require("../models/Messages");
const Group = require("../models/Group");

function unique(list) {
  return [...new Set((list || []).map(item => String(item || "").trim()).filter(Boolean))];
}

async function getPrivateDialogUsernames(username) {
  const rows = await Message.aggregate([
    {
      $match: {
        chatType: { $ne: "group" },
        $or: [{ from: username }, { to: username }]
      }
    },
    {
      $project: {
        otherUser: {
          $cond: [{ $eq: ["$from", username] }, "$to", "$from"]
        }
      }
    },
    { $match: { otherUser: { $nin: ["", username] } } },
    { $group: { _id: "$otherUser" } }
  ]);

  return rows.map(row => row._id).filter(Boolean);
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

  const [privateExists, groupExists] = await Promise.all([
    Message.exists({
      chatType: { $ne: "group" },
      $or: [
        { from: userA, to: userB },
        { from: userB, to: userA }
      ]
    }),
    Group.exists({
      members: { $all: [userA, userB] }
    })
  ]);

  return Boolean(privateExists || groupExists);
}

module.exports = {
  getRelatedUsernames,
  usersAreRelated
};
