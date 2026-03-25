#!/usr/bin/env node
/**
 * Regenerates TypeScript types from proto files using ts-proto.
 * Requires protoc and grpc_tools_node_protoc_plugin to be installed globally.
 *
 * Usage: node scripts/generate.js
 */

import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { mkdirSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const protoDir = resolve(root, 'proto')
const outDir = resolve(root, 'src', 'generated')

mkdirSync(outDir, { recursive: true })

const pluginPath = resolve(root, 'node_modules', '.bin', 'protoc-gen-ts_proto')

const cmd = [
  'protoc',
  `--plugin=protoc-gen-ts_proto=${pluginPath}`,
  `--ts_proto_out=${outDir}`,
  '--ts_proto_opt=esModuleInterop=true',
  '--ts_proto_opt=outputServices=grpc-js',
  '--ts_proto_opt=useDate=true',
  `--proto_path=${protoDir}`,
  `${protoDir}/auth.proto`,
].join(' ')

console.log('Running:', cmd)
execSync(cmd, { stdio: 'inherit' })
console.log('Proto generation complete → src/generated/')
