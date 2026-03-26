import jwt from 'jsonwebtoken'
import { createAuthClient } from '@fusion-d/proto'
import type { AuthServiceClient } from '@fusion-d/proto'

let _client: AuthServiceClient | null = null

export function getAuthClient(address: string, serviceToken: string): AuthServiceClient {
  if (!_client) {
    _client = createAuthClient(address, () =>
      jwt.sign({ iss: 'api' }, serviceToken, { expiresIn: 60 }),
    )
  }
  return _client
}
