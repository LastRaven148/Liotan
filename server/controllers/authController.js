const crypto =
  require("crypto");

const bcrypt =
  require("bcrypt");

const jwt =
  require("jsonwebtoken");

const User =
  require("../models/User");

const Message =
  require("../models/Messages");

const Group =
  require("../models/Group");

const EmailCode =
  require("../models/EmailCode");

const deleteUploadedFile =
  require("../utils/deleteUploadedFile");

const {
  normalizeEmail,
  hashEmail,
  hmac
} = require("../utils/privacy");

const {
  sendEmailCode
} = require("../utils/mailer");

const {
  isValidUsername,
  isValidPassword,
  isValidEmail,
  isValidEmailCode
} = require("../utils/validators");

function createCode() {
  return String(
    crypto.randomInt(
      100000,
      1000000
    )
  );
}

function signToken(user) {
  return jwt.sign(
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
}

async function saveEmailCode({
  emailHash,
  purpose,
  code
}) {
  await EmailCode.deleteMany({
    emailHash,
    purpose
  });

  await EmailCode.create({
    emailHash,
    purpose,
    codeHash:
      hmac(code)
  });
}

async function verifyEmailCode({
  emailHash,
  purpose,
  code
}) {
  if (!isValidEmailCode(code)) {
    return false;
  }

  const record =
    await EmailCode.findOne({
      emailHash,
      purpose
    });

  if (!record) {
    return false;
  }

  if (record.attempts >= 5) {
    await EmailCode.deleteOne({
      _id: record._id
    });

    return false;
  }

  const ok =
    record.codeHash === hmac(code);

  if (!ok) {
    record.attempts += 1;
    await record.save();
    return false;
  }

  await EmailCode.deleteOne({
    _id: record._id
  });

  return true;
}

async function sendAuthCode(
  req,
  res,
  next
) {

  try {

    const {
      email,
      purpose = "register"
    } = req.body;

    if (
      !isValidEmail(email) ||
      !["register", "reset"].includes(purpose)
    ) {
      return res.status(400).json({
        error: "invalid email"
      });
    }

    const cleanEmail =
      normalizeEmail(email);

    const emailHash =
      hashEmail(cleanEmail);

    const exists =
      await User.findOne({
        emailHash
      });

    if (purpose === "register" && exists) {
      return res.status(400).json({
        error: "email already used"
      });
    }

    if (purpose === "reset" && !exists) {
      return res.status(400).json({
        error: "email not found"
      });
    }

    const code =
      createCode();

    await saveEmailCode({
      emailHash,
      purpose,
      code
    });

    const result =
      await sendEmailCode({
        to: cleanEmail,
        code,
        purpose
      });

    res.json({
      ok: true,
      sent: result.sent,
      devCode:
        result.sent || process.env.NODE_ENV === "production"
          ? undefined
          : code
    });

  } catch (err) {
    next(err);
  }

}


async function verifyAuthCode(
  req,
  res,
  next
) {

  try {

    const {
      email,
      purpose = "register",
      code
    } = req.body;

    if (
      !isValidEmail(email) ||
      !isValidEmailCode(code) ||
      !["register", "reset"].includes(purpose)
    ) {
      return res.status(400).json({
        error: "invalid code"
      });
    }

    const cleanEmail =
      normalizeEmail(email);

    const emailHash =
      hashEmail(cleanEmail);

    const exists =
      await User.findOne({
        emailHash
      });

    if (purpose === "register" && exists) {
      return res.status(400).json({
        error: "email already used"
      });
    }

    if (purpose === "reset" && !exists) {
      return res.status(400).json({
        error: "email not found"
      });
    }

    const record =
      await EmailCode.findOne({
        emailHash,
        purpose
      });

    if (!record) {
      return res.status(400).json({
        error: "invalid code"
      });
    }

    if (record.attempts >= 5) {
      await EmailCode.deleteOne({
        _id: record._id
      });

      return res.status(400).json({
        error: "invalid code"
      });
    }

    const ok =
      record.codeHash === hmac(code);

    if (!ok) {
      record.attempts += 1;
      await record.save();

      return res.status(400).json({
        error: "invalid code"
      });
    }

    res.json({
      ok: true
    });

  } catch (err) {
    next(err);
  }

}

async function register(
  req,
  res,
  next
) {

  try {

    const {
      username,
      password,
      email,
      code
    } = req.body;

    if (
      !isValidUsername(username) ||
      !isValidPassword(password) ||
      !isValidEmail(email) ||
      !isValidEmailCode(code)
    ) {
      return res.status(400).json({
        error: "invalid credentials"
      });
    }

    const cleanUsername =
      username.trim();

    const cleanEmail =
      normalizeEmail(email);

    const emailHash =
      hashEmail(cleanEmail);

    const exists =
      await User.findOne({
        $or: [
          { username: cleanUsername },
          { emailHash }
        ]
      });

    if (exists) {
      return res.status(400).json({
        error: "exists"
      });
    }

    const verified =
      await verifyEmailCode({
        emailHash,
        purpose: "register",
        code
      });

    if (!verified) {
      return res.status(400).json({
        error: "invalid code"
      });
    }

    const hash =
      await bcrypt.hash(
        password,
        12
      );

    await User.create({
      username: cleanUsername,
      password: hash,
      emailHash,
      emailVerified: true,
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

    const loginValue =
      String(username || "").trim();

    if (
      !loginValue ||
      !isValidPassword(password)
    ) {
      return res.status(400).json({
        error: "invalid credentials"
      });
    }

    const query =
      isValidEmail(loginValue)
        ? {
            emailHash:
              hashEmail(loginValue)
          }
        : {
            username:
              loginValue
          };

    const user =
      await User.findOne(query);

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

    res.json({
      token:
        signToken(user),
      username:
        user.username
    });

  } catch (err) {
    next(err);
  }

}

async function resetPassword(
  req,
  res,
  next
) {

  try {

    const {
      email,
      code,
      password
    } = req.body;

    if (
      !isValidEmail(email) ||
      !isValidEmailCode(code) ||
      !isValidPassword(password)
    ) {
      return res.status(400).json({
        error: "invalid credentials"
      });
    }

    const emailHash =
      hashEmail(email);

    const user =
      await User.findOne({
        emailHash
      });

    if (!user) {
      return res.status(400).json({
        error: "email not found"
      });
    }

    const verified =
      await verifyEmailCode({
        emailHash,
        purpose: "reset",
        code
      });

    if (!verified) {
      return res.status(400).json({
        error: "invalid code"
      });
    }

    user.password =
      await bcrypt.hash(
        password,
        12
      );

    await user.save();

    res.json({
      ok: true
    });

  } catch (err) {
    next(err);
  }

}

async function deleteMe(
  req,
  res,
  next
) {

  try {

    const username =
      req.user.username;

    const user =
      await User.findOne({
        username
      });

    if (!user) {
      return res.status(404).json({
        error: "user not found"
      });
    }

    await deleteUploadedFile(
      user.avatar
    );

    const messages =
      await Message.find({
        $or: [
          { from: username },
          { to: username }
        ]
      });

    for (const msg of messages) {
      await deleteUploadedFile(
        msg.attachment?.url
      );
    }

    await Message.deleteMany({
      $or: [
        { from: username },
        { to: username }
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

    await Group.deleteMany({
      members: {
        $size: 0
      }
    });

    await User.deleteOne({
      username
    });

    res.json({
      ok: true
    });

  } catch (err) {
    next(err);
  }

}

module.exports = {
  sendAuthCode,
  verifyAuthCode,
  register,
  login,
  resetPassword,
  deleteMe
};
