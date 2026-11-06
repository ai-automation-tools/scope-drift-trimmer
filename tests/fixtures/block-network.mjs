// Preloaded with `node --import` by tests/cli.test.ts: every outbound connection throws.
import net from "node:net";
import tls from "node:tls";
import http from "node:http";
import https from "node:https";
import dgram from "node:dgram";

const blocked = () => {
  throw new Error("network blocked by test");
};
net.Socket.prototype.connect = blocked;
net.connect = net.createConnection = blocked;
tls.connect = blocked;
http.request = http.get = https.request = https.get = blocked;
dgram.createSocket = blocked;
globalThis.fetch = blocked;
