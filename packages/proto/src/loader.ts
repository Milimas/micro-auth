import * as grpc from '@grpc/grpc-js'
import * as protoLoader from '@grpc/proto-loader'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const PROTO_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../proto/auth.proto',
)

const PROTO_OPTIONS: protoLoader.Options = {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
}

let _packageDef: protoLoader.PackageDefinition | null = null

function getPackageDefinition(): protoLoader.PackageDefinition {
  if (!_packageDef) {
    _packageDef = protoLoader.loadSync(PROTO_PATH, PROTO_OPTIONS)
  }
  return _packageDef
}

function getAuthPackage(): grpc.GrpcObject {
  const packageDef = getPackageDefinition()
  const loaded = grpc.loadPackageDefinition(packageDef) as Record<string, grpc.GrpcObject>
  const authPkg = loaded['auth']
  if (!authPkg) throw new Error('Failed to load auth proto package')
  return authPkg
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceConstructor = new (address: string, credentials: grpc.ChannelCredentials, options?: object) => any

export function getAuthServiceClient(): ServiceConstructor {
  const pkg = getAuthPackage()
  return pkg['AuthService'] as ServiceConstructor
}

export function getAuthServiceDefinition(): grpc.ServiceDefinition {
  const pkg = getAuthPackage()
  return (pkg['AuthService'] as { service: grpc.ServiceDefinition }).service
}
