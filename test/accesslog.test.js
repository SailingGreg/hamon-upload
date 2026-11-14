// node test/accesslog.test.js - the access log: de-dupe, change lines, save diff
const assert = require('assert')
const { AccessLog, clientIp, configChanges } = require('../src/backend/utils/accessLog')

let now = Date.parse('2026-11-14T10:00:00Z')
const lines = []
const log = new AccessLog('unused', { now: () => now, write: (l) => lines.push(JSON.parse(l)) })
const greg = { id: 2, login: 'admin-user', role: 'Admin', isGrafanaAdmin: false }
const quiet = console.log
console.log = () => {}
try {
  assert.ok(log.visit(greg, '1.2.3.4'))
  assert.ok(!log.visit(greg, '1.2.3.4'), 'same user+ip within the hour: once')
  assert.ok(log.visit(greg, '5.6.7.8'), 'another ip: logged')
  now += 61 * 60 * 1000
  assert.ok(log.visit(greg, '1.2.3.4'), 'an hour on: again')
  log.change(greg, '1.2.3.4', 'save', 'changed siteA')
  log.change(greg, '1.2.3.4', 'save', 'changed siteA')
  assert.strictEqual(lines.filter((l) => l.action === 'save').length, 2, 'changes always logged')
  assert.deepStrictEqual(Object.keys(lines[4]).sort(), ['action', 'admin', 'detail', 'id', 'ip', 'role', 't', 'user'])
  assert.ok(log.refused('9.9.9.9', 'no session', 'dns-status'))
  assert.ok(!log.refused('9.9.9.9', 'no session', 'site-state'), 'refusals once an hour per ip+reason')
  assert.ok(log.refused('9.9.9.9', 'session refused (401)', 'site-state'))
} finally { console.log = quiet }

assert.strictEqual(clientIp({ headers: { 'x-forwarded-for': '81.1.1.1, 127.0.0.1' }, socket: { remoteAddress: '127.0.0.1' } }), '81.1.1.1')
assert.strictEqual(clientIp({ headers: {}, socket: { remoteAddress: '127.0.0.1' } }), '127.0.0.1')

const before = { silence: 'act', locations: { 'Location-1': { name: 'a', enabled: true, dns: 'x' }, 'Location-2': { name: 'b', enabled: true } } }
assert.strictEqual(configChanges(before, JSON.parse(JSON.stringify(before))), 'no change')
const after = { silence: 'report', locations: { 'Location-1': { dns: 'x', enabled: false, name: 'a' }, 'Location-3': { name: 'c' } } }
assert.strictEqual(configChanges(before, after), 'changed a; added c; removed b; top-level silence')
assert.strictEqual(configChanges(before, { silence: 'act', locations: { 'Location-1': { dns: 'x', name: 'a', enabled: true }, 'Location-2': { name: 'b', enabled: true } } }), 'no change', 'key order ignored')
console.log('accesslog.test.js: all checks passed')
