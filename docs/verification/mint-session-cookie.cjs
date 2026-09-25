/**
 * Mint a DSH browser-session cookie for automated, headless verification.
 *
 * DSH Web authenticates browsers with a signed, authority-bound, HttpOnly
 * cookie. A fresh headless Chrome profile has none, so it only ever receives
 * "dsh web authentication required" instead of the app. Rather than mint a
 * throwaway Harness home or weaken the host's auth, this reproduces the exact
 * cookie the running host issues, from the SAME persisted secret it loaded
 * (`.credentials.yaml` -> records['client-connection/browser-session']).
 *
 * Format, verified against dsh-client-connection/lib/index.js:
 *   name  = "dsh-auth-" + base64url(sha256(authority))
 *   value = "v1." + base64url(JSON payload) + "." + base64url(hmacSha256(secret, body))
 *
 * The cookie is written to session-cookie.txt for the verifier to seed. It is
 * a local-only credential for 127.0.0.1 and is deleted after use.
 */
const { createHash, createHmac, randomBytes } = require('node:crypto')
const { readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { homedir } = require('node:os')

const AUTHORITY = '127.0.0.1:3080'
const MAX_AGE_DAYS = 1

const b64url = buf => buf.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')

/** Read the browser-session signing secret the running host loaded. */
function readSecret() {
  const file = join(homedir(), '.dsh', '.credentials.yaml')
  const text = readFileSync(file, 'utf8')
  // The record block is small and fixed-shape; a targeted match avoids
  // pulling in a YAML dependency for one field.
  const at = text.indexOf('client-connection/browser-session:')
  if (at === -1) throw new Error('browser-session record missing from .credentials.yaml')
  const match = text.slice(at).match(/secret:\s*([A-Za-z0-9_-]+)/)
  if (!match) throw new Error('browser-session secret missing')
  return Buffer.from(match[1].replaceAll('-', '+').replaceAll('_', '/') + '=', 'base64')
}

function cookieName(authority) {
  return 'dsh-auth-' + b64url(createHash('sha256').update(authority).digest())
}

function encodeCookie(payload, secret) {
  const body = b64url(Buffer.from(JSON.stringify(payload), 'utf8'))
  const sig = b64url(createHmac('sha256', secret).update(body).digest())
  return `v1.${body}.${sig}`
}

function main() {
  const secret = readSecret()
  if (secret.byteLength !== 32) throw new Error(`unexpected secret length ${secret.byteLength}`)

  const issuedAt = Date.now()
  const expiresAt = issuedAt + MAX_AGE_DAYS * 24 * 60 * 60 * 1000
  const value = encodeCookie({ version: 1, authority: AUTHORITY, issuedAt, expiresAt }, secret)
  const name = cookieName(AUTHORITY)

  writeFileSync(join(__dirname, 'session-cookie.txt'), `${name}=${value}`, 'utf8')
  console.log(JSON.stringify({ name, valueLength: value.length, authority: AUTHORITY, expiresAt: new Date(expiresAt).toISOString() }))
}

main()
