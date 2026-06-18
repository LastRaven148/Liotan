const Group =
  require("../models/Group");

const User =
  require("../models/User");

const {
  isValidUsername
} = require("../utils/validators");

function normalizeMembers(
  members,
  owner
) {

  const list =
    Array.isArray(members)
      ? members
      : [];

  return [
    ...new Set([
      owner,
      ...list.filter(isValidUsername)
    ])
  ];

}

async function createGroup(
  req,
  res,
  next
) {

  try {

    const owner =
      req.user.username;

    const name =
      typeof req.body.name === "string"
        ? req.body.name.trim()
        : "";

    const description =
      typeof req.body.description === "string"
        ? req.body.description.trim()
        : "";

    if (
      !name ||
      name.length > 40
    ) {
      return res.status(400).json({
        error: "invalid group name"
      });
    }

    const members =
      normalizeMembers(
        req.body.members,
        owner
      );

    const existingUsers =
      await User.find(
        {
          username: {
            $in: members
          }
        },
        "username"
      );

    const validMembers =
      existingUsers.map(
        user => user.username
      );

    if (
      !validMembers.includes(owner)
    ) {
      validMembers.push(owner);
    }

    const group =
      await Group.create({
        name,
        description,
        owner,
        admins: [owner],
        members: validMembers
      });

    res.status(201).json(group);

  } catch (err) {
    next(err);
  }

}

async function getMyGroups(
  req,
  res,
  next
) {

  try {

    const username =
      req.user.username;

    const groups =
      await Group.find({
        members: username
      }).sort({
        updatedAt: -1
      });

    res.json(groups);

  } catch (err) {
    next(err);
  }

}

async function getGroupById(
  req,
  res,
  next
) {

  try {

    const username =
      req.user.username;

    const group =
      await Group.findById(
        req.params.id
      );

    if (!group) {
      return res.status(404).json({
        error: "group not found"
      });
    }

    if (
      !group.members.includes(username)
    ) {
      return res.status(403).json({
        error: "access denied"
      });
    }

    res.json(group);

  } catch (err) {
    next(err);
  }

}

module.exports = {
  createGroup,
  getMyGroups,
  getGroupById
};