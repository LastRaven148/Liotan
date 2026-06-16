const bcrypt =
  require("bcrypt");

const jwt =
  require("jsonwebtoken");

const User =
  require("../models/User");

const {
  isValidUsername,
  isValidPassword
} = require("../utils/validators");

async function register(
  req,
  res,
  next
) {

  try {

    const {
      username,
      password
    } = req.body;

    if (
      !isValidUsername(username) ||
      !isValidPassword(password)
    ) {
      return res.status(400).json({
        error: "invalid credentials"
      });
    }

    const cleanUsername =
      username.trim();

    const exists =
      await User.findOne({
        username: cleanUsername
      });

    if (exists) {
      return res.status(400).json({
        error: "exists"
      });
    }

    const hash =
      await bcrypt.hash(
        password,
        10
      );

    await User.create({
      username: cleanUsername,
      password: hash,
      lastSeen: new Date()
    });

    res.json({
      ok: true
    });

  } catch (err) {
    next(err);
  }

}

async function login(
  req,
  res,
  next
) {

  try {

    const {
      username,
      password
    } = req.body;

    if (
      !isValidUsername(username) ||
      !isValidPassword(password)
    ) {
      return res.status(400).json({
        error: "invalid credentials"
      });
    }

    const cleanUsername =
      username.trim();

    const user =
      await User.findOne({
        username: cleanUsername
      });

    if (!user) {
      return res.status(400).json({
        error: "invalid credentials"
      });
    }

    const ok =
      await bcrypt.compare(
        password,
        user.password
      );

    if (!ok) {
      return res.status(400).json({
        error: "invalid credentials"
      });
    }

    user.lastSeen =
      new Date();

    await user.save();

    const token =
      jwt.sign(
        {
          userId:
            user._id.toString(),
          username:
            user.username
        },
        process.env.JWT_SECRET,
        {
          expiresIn: "7d"
        }
      );

    res.json({
      token,
      username:
        user.username
    });

  } catch (err) {
    next(err);
  }

}

module.exports = {
  register,
  login
};