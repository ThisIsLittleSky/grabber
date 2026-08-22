// lib/notify.js — 日志（控制台/文件/webhook）与通知
'use strict';
var fs = require('fs');
var path = require('path');
var http = require('http');
var https = require('https');

var LEVEL_COLOR = {
  info: '\x1b[36m', // cyan
  hit: '\x1b[33m',  // yellow
  ok: '\x1b[32m',   // green
  err: '\x1b[31m',  // red
  warn: '\x1b[35m', // magenta（与黄色命中区分）
  dim: '\x1b[90m'
};
var RESET = '\x1b[0m';

function beep() { try { process.stdout.write('\x07'); } catch (e) {} }

function ts() { return new Date().toLocaleString('zh-CN', { hour12: false }); }

function makeLogger(cfg) {
  var logFile = path.resolve(__dirname, '..', cfg.logFile || 'grab.log');
  var stream = null;
  try { stream = fs.createWriteStream(logFile, { flags: 'a', encoding: 'utf8' }); } catch (e) { stream = null; }
  var lines = [];

  function log(msg, level) {
    level = level || 'info';
    var line = '[' + ts() + '] ' + msg;
    var color = LEVEL_COLOR[level] || '';
    console.log(color ? color + line + RESET : line);
    if (stream) { try { stream.write(line + '\n'); } catch (e) {} }
    lines.push({ t: ts(), level: level, msg: msg });
    if (lines.length > 200) lines.shift();
  }

  function notify(title, body) {
    log('[通知] ' + title + (body ? ' - ' + body : ''), 'warn');
    if (cfg.notify && cfg.notify.webhook) {
      postWebhook(cfg.notify.webhook, title, body || '');
    }
    if (cfg.notify && cfg.notify.beep) beep();
  }

  return { log: log, notify: notify, lines: lines };
}

// 通用 webhook：POST JSON {title, desp}。兼容 ServerChan / PushPlus 类推送。
function postWebhook(url, title, body) {
  var lib = /^https:/.test(url) ? https : http;
  var u;
  try { u = new URL(url); } catch (e) { return; }
  var payload = JSON.stringify({ title: title, desp: body });
  var options = {
    hostname: u.hostname,
    port: u.port || (lib === https ? 443 : 80),
    path: u.pathname + u.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  };
  var req = lib.request(options, function (res) {
    res.resume();
    res.on('end', function () {});
  });
  req.on('error', function () {});
  req.setTimeout(5000, function () { req.destroy(); });
  req.end(payload);
}

module.exports = { makeLogger: makeLogger, beep: beep };
