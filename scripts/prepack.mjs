#!/usr/bin/env node
/**
 * Cross-platform `prepack` wrapper: rebuild lib before packing, but keep the
 * build's stdout OFF the process stdout. `npm pack --json` parses stdout as
 * JSON, so any tsdown banner leaking to stdout corrupts the pack gate and
 * tooling that drives npm pack programmatically. Build progress is forwarded
 * to stderr instead.
 */
import { spawnSync } from 'node:child_process'

// Windows: pnpm is a `.cmd` shim, and Node ≥20 refuses to spawn `.cmd`/`.bat`
// without a shell (CVE-2024-27980 batch-argument injection). `shell: true`
// there is what makes the shim runnable at all; the whole command is a fixed
// literal passed as one string (Node deprecates an args array under a shell),
// so nothing user-controlled reaches the command line.
const win = process.platform === 'win32'
const result = win
  ? spawnSync('pnpm.cmd run build', { env: process.env, stdio: ['ignore', 'pipe', 'pipe'], shell: true })
  : spawnSync('pnpm', ['run', 'build'], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] })

// A failed spawn leaves stdout/stderr undefined (not just empty) — check the
// error first so the report is the spawn failure, not a property access on it.
if (result.error !== undefined) throw result.error
if (result.stdout !== null && result.stdout.length > 0) process.stderr.write(result.stdout)
if (result.stderr !== null && result.stderr.length > 0) process.stderr.write(result.stderr)
if (result.status !== 0) process.exit(result.status ?? 1)
