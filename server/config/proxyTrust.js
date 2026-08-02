"use strict";

const net = require("node:net");

const TOPOLOGIES = new Set(["direct", "trusted-nginx", "cloudflare-nginx"]);

function normalizeIp(value) {
  let ip = String(value || "").trim().toLowerCase();
  if (ip.startsWith("[") && ip.endsWith("]")) ip = ip.slice(1, -1);
  const zone = ip.indexOf("%");
  if (zone > -1) ip = ip.slice(0, zone);
  if (ip.startsWith("::ffff:") && net.isIP(ip.slice(7)) === 4) ip = ip.slice(7);
  return net.isIP(ip) ? ip : "";
}

function ipv4Value(ip) {
  return ip.split(".").reduce((value, part) => (value << 8n) | BigInt(Number(part)), 0n);
}

function ipv6Groups(ip) {
  let input = ip;
  if (input.includes(".")) {
    const lastColon = input.lastIndexOf(":");
    const v4 = input.slice(lastColon + 1);
    const value = ipv4Value(v4);
    input = `${input.slice(0, lastColon)}:${((value >> 16n) & 0xffffn).toString(16)}:${(value & 0xffffn).toString(16)}`;
  }
  const halves = input.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const groups = [...left, ...Array(missing).fill("0"), ...right];
  if (groups.length !== 8 || groups.some(group => !/^[0-9a-f]{1,4}$/i.test(group))) return null;
  return groups;
}

function ipValue(ip) {
  const version = net.isIP(ip);
  if (version === 4) return { version, bits: 32, value: ipv4Value(ip) };
  if (version === 6) {
    const groups = ipv6Groups(ip);
    if (!groups) return null;
    return {
      version,
      bits: 128,
      value: groups.reduce((value, group) => (value << 16n) | BigInt(`0x${group}`), 0n)
    };
  }
  return null;
}

function parseCidr(value) {
  const [rawIp, rawPrefix] = String(value || "").trim().split("/");
  const ip = normalizeIp(rawIp);
  const parsed = ipValue(ip);
  if (!parsed) return null;
  const prefix = rawPrefix === undefined ? parsed.bits : Number(rawPrefix);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > parsed.bits) return null;
  const shift = BigInt(parsed.bits - prefix);
  return {
    version: parsed.version,
    prefix,
    network: (parsed.value >> shift) << shift
  };
}

function parseTrustedCidrs(value) {
  const raw = String(value || "").split(",").map(item => item.trim()).filter(Boolean);
  const parsed = raw.map(parseCidr);
  if (parsed.some(item => !item)) throw new TypeError("TRUSTED_PROXY_CIDRS contains an invalid CIDR");
  return parsed;
}

function isTrustedProxyAddress(value, cidrs) {
  const ip = normalizeIp(value);
  const parsed = ipValue(ip);
  if (!parsed) return false;
  return cidrs.some(cidr => {
    if (cidr.version !== parsed.version) return false;
    const shift = BigInt(parsed.bits - cidr.prefix);
    return ((parsed.value >> shift) << shift) === cidr.network;
  });
}

function proxyConfigFromEnv(source = process.env) {
  const topology = String(source.LIOTAN_PROXY_TOPOLOGY || "direct").trim().toLowerCase();
  if (!TOPOLOGIES.has(topology)) throw new TypeError("LIOTAN_PROXY_TOPOLOGY is invalid");
  const fallback = source.NODE_ENV === "production" ? "" : "127.0.0.1/32,::1/128";
  const trustedCidrs = parseTrustedCidrs(source.TRUSTED_PROXY_CIDRS || fallback);
  if (topology !== "direct" && trustedCidrs.length === 0) {
    throw new TypeError("TRUSTED_PROXY_CIDRS is required for a proxied topology");
  }
  return { topology, trustedCidrs };
}

function expressTrustProxy(source = process.env) {
  const config = proxyConfigFromEnv(source);
  if (config.topology === "direct") return false;
  return address => isTrustedProxyAddress(address, config.trustedCidrs);
}

function socketClientIp(socket, source = process.env) {
  const immediate = normalizeIp(
    socket.handshake?.address ||
    socket.conn?.remoteAddress ||
    socket.request?.socket?.remoteAddress
  );
  const config = proxyConfigFromEnv(source);
  if (config.topology === "direct" || !isTrustedProxyAddress(immediate, config.trustedCidrs)) {
    return immediate || "unknown";
  }

  const forwarded = String(socket.handshake?.headers?.["x-forwarded-for"] || "");
  const chain = forwarded.split(",").map(normalizeIp).filter(Boolean).slice(-16);
  chain.push(immediate);
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    if (!isTrustedProxyAddress(chain[index], config.trustedCidrs)) return chain[index];
  }
  return chain[0] || immediate || "unknown";
}

module.exports = {
  TOPOLOGIES,
  normalizeIp,
  parseCidr,
  parseTrustedCidrs,
  isTrustedProxyAddress,
  proxyConfigFromEnv,
  expressTrustProxy,
  socketClientIp
};
