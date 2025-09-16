import {
  isDidFid,
  asDidFid,
  assertDidFid,
  DID_FID_PREFIX
} from '../../src/methods/fid'

describe('Farcaster DID methods', () => {
  describe('isDidFid', () => {
    it('should return true for valid did:fid', () => {
      expect(isDidFid('did:fid:1')).toBe(true)
      expect(isDidFid('did:fid:123')).toBe(true)
      expect(isDidFid('did:fid:999999999')).toBe(true)
    })

    it('should return false for invalid did:fid', () => {
      expect(isDidFid('did:fid:0')).toBe(false) // starts with zero
      expect(isDidFid('did:fid:01')).toBe(false) // leading zero
      expect(isDidFid('did:fid:')).toBe(false) // empty identifier
      expect(isDidFid('did:fid:abc')).toBe(false) // non-numeric
      expect(isDidFid('did:plc:abc123')).toBe(false) // wrong method
      expect(isDidFid('not-a-did')).toBe(false)
      expect(isDidFid(123)).toBe(false)
      expect(isDidFid(null)).toBe(false)
      expect(isDidFid(undefined)).toBe(false)
    })
  })

  describe('asDidFid', () => {
    it('should return the DID for valid input', () => {
      const did = 'did:fid:1898'
      expect(asDidFid(did)).toBe(did)
    })

    it('should throw for invalid input', () => {
      expect(() => asDidFid('did:fid:0')).toThrow()
      expect(() => asDidFid('not-a-did')).toThrow()
    })
  })

  describe('assertDidFid', () => {
    it('should not throw for valid did:fid', () => {
      expect(() => assertDidFid('did:fid:1')).not.toThrow()
      expect(() => assertDidFid('did:fid:123456')).not.toThrow()
    })

    it('should throw InvalidDidError for non-string input', () => {
      expect(() => assertDidFid(123)).toThrow('DID must be a string')
      expect(() => assertDidFid(null)).toThrow('DID must be a string')
    })

    it('should throw InvalidDidError for wrong prefix', () => {
      expect(() => assertDidFid('did:plc:abc123')).toThrow('Invalid did:fid prefix')
      expect(() => assertDidFid('not-a-did')).toThrow('Invalid did:fid prefix')
    })

    it('should throw InvalidDidError for invalid identifier', () => {
      expect(() => assertDidFid('did:fid:0')).toThrow('did:fid must be decimal digits and not start with zero')
      expect(() => assertDidFid('did:fid:01')).toThrow('did:fid must be decimal digits and not start with zero')
      expect(() => assertDidFid('did:fid:abc')).toThrow('did:fid must be decimal digits and not start with zero')
      expect(() => assertDidFid('did:fid:')).toThrow('did:fid must be decimal digits and not start with zero')
    })
  })

  describe('DID_FID_PREFIX', () => {
    it('should be the correct prefix', () => {
      expect(DID_FID_PREFIX).toBe('did:fid:')
    })
  })
})