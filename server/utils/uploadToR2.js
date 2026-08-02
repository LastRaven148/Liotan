const crypto = require("crypto");
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

function getR2Config(storageClass = "private-media") {
  const avatar = storageClass === "public-avatar";
  const prefix = avatar ? "R2_AVATAR" : "R2_MEDIA";
  const accountId = requireEnv(`${prefix}_ACCOUNT_ID`);
  const endpoint = String(process.env[`${prefix}_ENDPOINT`] || `https://${accountId}.r2.cloudflarestorage.com`).replace(/\/+$/, "");

  return {
    accountId,
    accessKeyId: requireEnv(`${prefix}_ACCESS_KEY_ID`),
    secretAccessKey: requireEnv(`${prefix}_SECRET_ACCESS_KEY`),
    bucket: requireEnv(`${prefix}_BUCKET`),
    publicUrl: avatar ? String(process.env.R2_AVATAR_PUBLIC_URL || "").trim().replace(/\/+$/, "") : "",
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


function encodeQueryValue(value) {
  return encodeURIComponent(String(value || "")).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function canonicalizeQuery(query = "") {
  const raw = String(query || "").replace(/^\?/, "");
  if (!raw) return { canonicalQuery: "", requestQuery: "" };

  const params = new URLSearchParams(raw);
  const pairs = [];

  for (const [key, value] of params.entries()) {
    pairs.push([encodeQueryValue(key), encodeQueryValue(value)]);
  }

  pairs.sort((a, b) => {
    if (a[0] === b[0]) return a[1].localeCompare(b[1]);
    return a[0].localeCompare(b[0]);
  });

  const canonicalQuery = pairs.map(([key, value]) => `${key}=${value}`).join("&");
  return {
    canonicalQuery,
    requestQuery: canonicalQuery ? `?${canonicalQuery}` : ""
  };
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

function getFileSize(file) {
  if (Number.isFinite(file?.size)) return Number(file.size);
  if (file?.buffer) return file.buffer.length;
  return 0;
}

function getRequestBody(file, method) {
  if (method === "DELETE" || method === "GET" || method === "HEAD") return null;
  if (file?.buffer) return file.buffer;
  if (typeof file?.openReadStream === "function") return file.openReadStream();
  return Buffer.alloc(0);
}

function requestR2({ method, key, file, contentType = "application/octet-stream", range = "", query = "", storageClass = "private-media", responseTarget = null, onResponse = null }) {
  const config = getR2Config(storageClass);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = (method === "DELETE" || method === "GET" || method === "HEAD") ? sha256("") : "UNSIGNED-PAYLOAD";
  const encodedKey = encodeR2Key(key);
  const endpoint = new URL(config.endpoint);
  const objectPath = key ? `/${config.bucket}/${encodedKey}` : `/${config.bucket}`;
  const { canonicalQuery, requestQuery } = canonicalizeQuery(query);
  const path = `${objectPath}${requestQuery}`;
  const host = endpoint.host;
  const contentLength = getFileSize(file);

  const headers = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate
  };

  if (method !== "DELETE" && method !== "GET" && method !== "HEAD") {
    headers["content-type"] = contentType;
    headers["content-length"] = String(contentLength);
    headers["cache-control"] = "private, max-age=0, no-store";
  }

  if ((method === "GET" || method === "HEAD") && range) {
    headers.range = String(range).trim();
  }

  const sortedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = sortedHeaderNames
    .map(name => `${name}:${String(headers[name]).trim()}\n`)
    .join("");
  const signedHeaders = sortedHeaderNames.join(";");
  const canonicalRequest = [
    method,
    objectPath,
    canonicalQuery,
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
      if (res.statusCode >= 200 && res.statusCode < 300 && responseTarget) {
        try {
          onResponse?.({ statusCode: res.statusCode, headers: res.headers });
        } catch (err) {
          res.destroy(err);
          reject(err);
          return;
        }
        res.on("error", err => responseTarget.destroy(err));
        responseTarget.on("error", reject);
        responseTarget.on("finish", () => resolve({ statusCode: res.statusCode, headers: res.headers }));
        res.pipe(responseTarget);
        return;
      }
      const chunks = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => {
        const responseBody = Buffer.concat(chunks).toString("utf8");
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({
            statusCode: res.statusCode,
            body: responseBody,
            buffer: Buffer.concat(chunks),
            headers: res.headers
          });
          return;
        }

        const err = new Error(`R2 ${method} failed with ${res.statusCode}`);
        err.status = 502;
        err.upstreamStatus = res.statusCode;
        err.code = res.statusCode === 404 ? "R2_OBJECT_NOT_FOUND" : "R2_REQUEST_FAILED";
        err.details = responseBody.slice(0, 500);
        reject(err);
      });
    });

    const timeoutMs = Number(process.env.R2_REQUEST_TIMEOUT_MS) || 120000;
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`R2 ${method} timed out after ${timeoutMs}ms`));
    });

    req.on("error", reject);

    const body = getRequestBody(file, method);
    if (!body) {
      req.end();
      return;
    }

    if (typeof body.pipe === "function") {
      body.on("error", err => req.destroy(err));
      body.pipe(req);
      return;
    }

    req.end(body);
  });
}

function getUploadFileMeta(file) {
  if (file?.buffer) return { size: file.buffer.length };
  if (Number.isSafeInteger(file?.size) && file.size >= 0) return { size: file.size };
  return { size: 0 };
}

async function uploadToR2(file, options = {}) {
  const storageClass = options.storageClass || "private-media";
  const config = getR2Config(storageClass);
  const key = buildObjectKey(file, options);
  const contentType = String(file?.mimetype || options.mimeType || "application/octet-stream");
  const meta = getUploadFileMeta(file);
  if (meta.size <= 0 || (!file?.buffer && typeof file?.openReadStream !== "function")) {
    const error = new Error("Upload payload is unavailable");
    error.status = 400;
    throw error;
  }
  const uploadFile = {
    ...file,
    size: meta.size
  };

  await requestR2({ method: "PUT", key, file: uploadFile, contentType, storageClass });

  return {
    url: config.publicUrl ? `${config.publicUrl}/${encodeR2Key(key)}` : "",
    key,
    storageType: `r2:${storageClass}`,
    bytes: meta.size,
    format: getExtension(file?.originalname || "").replace(/^\./, "")
  };
}

async function getFromR2(key, options = {}) {
  if (!key) {
    const err = new Error("R2 key is required");
    err.status = 404;
    throw err;
  }

  return requestR2({ method: "GET", key, range: options.range || "", storageClass: options.storageClass || "private-media" });
}

async function headFromR2(key, options = {}) {
  if (!key) {
    const err = new Error("R2 key is required");
    err.status = 404;
    throw err;
  }
  return requestR2({
    method: "HEAD",
    key,
    storageClass: options.storageClass || "private-media"
  });
}

async function streamFromR2(key, responseTarget, options = {}) {
  if (!key || !responseTarget) {
    const err = new Error("R2 streaming target and key are required");
    err.status = 404;
    throw err;
  }
  return requestR2({
    method: "GET",
    key,
    range: options.range || "",
    storageClass: options.storageClass || "private-media",
    responseTarget,
    onResponse: options.onResponse
  });
}

async function deleteFromR2(key, options = {}) {
  if (!key) return;
  try {
    await requestR2({ method: "DELETE", key, storageClass: options.storageClass || "private-media" });
  } catch (error) {
    if (error?.upstreamStatus === 404) return;
    throw error;
  }
}

function decodeXmlEntities(value = "") {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function readXmlTag(xml, tag) {
  const match = String(xml || "").match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match ? decodeXmlEntities(match[1]) : "";
}

function readXmlTags(xml, tag) {
  const result = [];
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g");
  let match;
  while ((match = re.exec(String(xml || "")))) {
    result.push(decodeXmlEntities(match[1]));
  }
  return result;
}

function readR2ObjectEntries(xml) {
  const entries = [];
  const re = /<Contents>([\s\S]*?)<\/Contents>/g;
  let match;
  while ((match = re.exec(String(xml || "")))) {
    entries.push({
      key: decodeXmlEntities(readXmlTag(match[1], "Key")),
      lastModified: readXmlTag(match[1], "LastModified")
    });
  }
  return entries.filter(entry => entry.key);
}

async function listR2Objects({
  prefix = "",
  continuationToken = "",
  maxKeys = 1000,
  storageClass = "private-media"
} = {}) {
  const params = new URLSearchParams();
  params.set("list-type", "2");
  params.set("max-keys", String(Math.max(1, Math.min(Number(maxKeys) || 1000, 1000))));
  if (prefix) params.set("prefix", prefix);
  if (continuationToken) params.set("continuation-token", continuationToken);

  const response = await requestR2({ method: "GET", key: "", query: params.toString(), storageClass });
  const body = response.body || "";

  return {
    keys: readXmlTags(body, "Key"),
    objects: readR2ObjectEntries(body),
    isTruncated: readXmlTag(body, "IsTruncated") === "true",
    nextContinuationToken: readXmlTag(body, "NextContinuationToken")
  };
}

async function deleteR2Prefix(prefix, options = {}) {
  const normalizedPrefix = String(prefix || "").trim();
  if (!normalizedPrefix || normalizedPrefix === "/") {
    const err = new Error("Refusing to delete empty R2 prefix");
    err.status = 400;
    throw err;
  }

  const dryRun = options.dryRun !== false;
  const maxObjects = Number(options.maxObjects) || 10000;
  const storageClass = options.storageClass || "private-media";
  let continuationToken = "";
  const keys = [];

  do {
    const page = await listR2Objects({ prefix: normalizedPrefix, continuationToken, storageClass });
    keys.push(...page.keys);
    continuationToken = page.nextContinuationToken;
    if (!page.isTruncated || keys.length >= maxObjects) break;
  } while (continuationToken);

  const limitedKeys = keys.slice(0, maxObjects);

  if (!dryRun) {
    for (const key of limitedKeys) {
      await deleteFromR2(key, { storageClass });
    }
  }

  return {
    prefix: normalizedPrefix,
    dryRun,
    found: keys.length,
    processed: limitedKeys.length,
    truncatedByLimit: keys.length > limitedKeys.length,
    keys: limitedKeys
  };
}

module.exports = {
  uploadToR2,
  getFromR2,
  headFromR2,
  streamFromR2,
  deleteFromR2,
  listR2Objects,
  deleteR2Prefix,
  isR2Configured: () => Boolean(process.env.R2_MEDIA_ACCOUNT_ID && process.env.R2_MEDIA_ACCESS_KEY_ID && process.env.R2_MEDIA_SECRET_ACCESS_KEY && process.env.R2_MEDIA_BUCKET)
};
