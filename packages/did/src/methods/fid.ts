import { InvalidDidError } from '../did-error.js'
import { Did } from '../did.js'

const DID_FID_PREFIX = `did:fid:`

export { DID_FID_PREFIX }

// DID helper functions
export function isDidFid(input: unknown): input is Did<'fid'> {
  if (typeof input !== 'string') return false
  if (!input.startsWith(DID_FID_PREFIX)) return false
  if (!/^[1-9]\d*$/.test(input.slice(DID_FID_PREFIX.length))) return false
  return true
}

export function asDidFid(input: unknown): Did<'fid'> {
  assertDidFid(input)
  return input
}

export function assertDidFid(input: unknown): asserts input is Did<'fid'> {
  if (typeof input !== 'string') {
    throw new InvalidDidError(typeof input, `DID must be a string`)
  }
  if (!input.startsWith(DID_FID_PREFIX)) {
    throw new InvalidDidError(input, `Invalid did:fid prefix`)
  }
  if (!/^[1-9]\d*$/.test(input.slice(DID_FID_PREFIX.length))) {
    throw new InvalidDidError(
      input,
      `did:fid must be decimal digits and not start with zero`,
    )
  }
}
