const crypto = require("crypto");
const fs = require("fs/promises");
const https = require("https");
const { URL } = require("url");
const { sanitizeAttachmentName } = require("./attachmentSafety");

function requireEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    const err = new Error(`${name} is not configured`);
    err.status = 500;
    throw err;
  }
  return value;
}

function getR2Config() {
  const accountId = requireEnv("R2_ACCOUNT_ID");
  const endpoint = String(process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`).replace(/\/+$/, "");

  return {
    accountId,
    accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    bucket: requireEnv("R2_BUCKET"),
    publicUrl: requireEnv("R2_PUBLIC_URL").replace(/\/+$/, ""),
    endpoint
  };
}

function sha256(value, encoding = "hex") {
  return crypto.createHash("sha256").update(value).digest(encoding);
}

function hmac(key, value, encoding) {
  return crypto.createHmac("sha256", key).update(value).digest(encoding);
}

function encodePathPart(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodeR2Key(key) {
  return String(key || "")
    .split("/")
    .map(encodePathPart)
    .join("/");
}

function safeSegment(value, fallback = "item") {
  return String(value || fallback)
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || fallback;
}

function getExtension(name = "") {
  const clean = sanitizeAttachmentName(name);
  const match = clean.match(/\.([a-zA-Z0-9]{1,12})$/);
  return match ? `.${match[1].toLowerCase()}` : "";
}

function buildObjectKey(file, options = {}) {
  const folder = String(options.folder || "liotan/uploads")
    .split("/")
    .map(part => safeSegment(part, "uploads"))
    .filter(Boolean)
    .join("/");

  const extension = getExtension(file?.originalname || "");
  const id = `${Date.now()}-${crypto.randomBytes(16).toString("hex")}`;

  return `${folder}/${id}${extension}`;
}

function getSigningKey(secretAccessKey, dateStamp) {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, "auto");
  const kService = hmac(kRegion, "s3");
  return hmac(kService, "aws4_request");
}

function requestR2({ method, key, body = Buffer.alloc(0), contentType = "application/octet-stream" }) {
  const config = getR2Config();
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256(body);
  const encodedKey = encodeR2Key(key);
  const endpoint = new URL(config.endpoint);
  const path = `/${config.bucket}/${encodedKey}`;
  const host = endpoint.host;

  const headers = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate
  };

  if (method !== "DELETE") {
    headers["content-type"] = contentType;
    headers["content-length"] = String(body.length);
    headers["cache-control"] = "public, max-age=31536000, immutable";
  }

  const sortedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = sortedHeaderNames
    .map(name => `${name}:${String(headers[name]).trim()}\n`)
    .join("");
  const signedHeaders = sortedHeaderNames.join(";");
  const canonicalRequest = [
    method,
    path,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join("\n");

  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256(canonicalRequest)
  ].join("\n");
  const signature = hmac(getSigningKey(config.secretAccessKey, dateStamp), stringToSign, "hex");

  const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return new Promise((resolve, reject) => {
    const req = https.request({
      method,
      hostname: endpoint.hostname,
      path,
      headers: {
        ...headers,
        authorization
      }
    }, res => {
      const chunks = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => {
        const responseBody = Buffer.concat(chunks).toString("utf8");
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ statusCode: res.statusCode, body: responseBody });
          return;
        }

        const err = new Error(`R2 ${method} failed with ${res.statusCode}`);
        err.status = 502;
        err.details = responseBody.slice(0, 500);
        reject(err);
      });
    });

    req.on("error", reject);
    if (body.length) req.write(body);
    req.end();
  });
}

async function readFileBuffer(file) {
  if (file?.buffer) return file.buffer;
  if (file?.path) return fs.readFile(file.path);
  return Buffer.alloc(0);
}

async function uploadToR2(file, options = {}) {
  const config = getR2Config();
  const body = await readFileBuffer(file);
  const key = buildObjectKey(file, options);
  const contentType = String(file?.mimetype || options.mimeType || "application/octet-stream");

  await requestR2({ method: "PUT", key, body, contentType });

  return {
    url: `${config.publicUrl}/${encodeR2Key(key)}`,
    key: key,
    storageType: "r2",
    bytes: body.length,
    format: getExtension(file?.originalname || "").replace(/^\./, "")
  };
}

async function deleteFromR2(key) {
  if (!key) return;
  await requestR2({ method: "DELETE", key });
}

module.exports = {
  uploadToR2,
  deleteFromR2,
  isR2Configured: () => Boolean(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET && process.env.R2_PUBLIC_URL)
};
