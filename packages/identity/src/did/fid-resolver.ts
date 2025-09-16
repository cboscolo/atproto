import { createPublicClient, getContract, http } from 'viem'
import { optimism } from 'viem/chains'
import { DidCache } from '../types'
import { BaseResolver } from './base-resolver'
import { timed } from './util'

export class DidFidResolver extends BaseResolver {
  private publicClient
  private readonly ID_REGISTRY_CONTRACT =
    '0x00000000Fc6c5F01Fc30151999387Bb99A9f489b'
  private readonly KEY_REGISTRY_CONTRACT =
    '0x00000000Fc1237824fb747aBDE0FF18990E59b7e'

  // ID Registry ABI - minimal functions needed
  private readonly ID_REGISTRY_ABI = [
    {
      inputs: [{ name: 'fid', type: 'uint256' }],
      name: 'custodyOf',
      outputs: [{ name: '', type: 'address' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [{ name: 'fid', type: 'uint256' }],
      name: 'recoveryOf',
      outputs: [{ name: '', type: 'address' }],
      stateMutability: 'view',
      type: 'function',
    },
  ] as const

  // Key Registry ABI - includes keyDataOf for key types
  private readonly KEY_REGISTRY_ABI = [
    {
      inputs: [
        { name: 'fid', type: 'uint256' },
        { name: 'state', type: 'uint8' },
      ],
      name: 'keysOf',
      outputs: [{ name: 'keys', type: 'bytes[]' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        { name: 'fid', type: 'uint256' },
        { name: 'key', type: 'bytes' },
      ],
      name: 'keyDataOf',
      outputs: [
        {
          components: [
            { name: 'state', type: 'uint8' },
            { name: 'keyType', type: 'uint32' },
          ],
          name: '',
          type: 'tuple',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
  ] as const

  constructor(
    public fidRpcUrl: string,
    public timeout: number,
    public cache?: DidCache,
  ) {
    super(cache)
    this.publicClient = createPublicClient({
      chain: optimism,
      transport: http(fidRpcUrl),
    })
  }

  async resolveNoCheck(did: string): Promise<unknown> {
    return timed(this.timeout, async () => {
      // Parse and validate DID
      const parts = did.split(':')
      if (parts.length !== 3 || parts[0] !== 'did' || parts[1] !== 'fid') {
        return null
      }

      const identifier = parts[2]
      if (!/^[1-9]\d*$/.test(identifier)) {
        return null
      }

      const fid = BigInt(identifier)
      if (fid <= 0n) {
        return null
      }

      try {
        const onChainData = await this.getFarcasterOnChainData(fid)
        if (!onChainData) {
          return null
        }

        // Get AT Protocol data (placeholder for now)
        const atProtoData = await this.getATProtoData(fid)

        return this.buildDIDDocument(did, onChainData, atProtoData)
      } catch (error) {
        console.error('DID resolution error:', error)
        return null
      }
    })
  }

  private async getFarcasterOnChainData(fid: bigint) {
    try {
      const idRegistry = getContract({
        address: this.ID_REGISTRY_CONTRACT,
        abi: this.ID_REGISTRY_ABI,
        client: this.publicClient,
      })

      const keyRegistry = getContract({
        address: this.KEY_REGISTRY_CONTRACT,
        abi: this.KEY_REGISTRY_ABI,
        client: this.publicClient,
      })

      // Get custody and recovery addresses
      const [custody, recovery] = await Promise.all([
        (idRegistry as any).read.custodyOf([fid]),
        (idRegistry as any).read.recoveryOf([fid]),
      ])

      // Check if FID exists (custody address should not be zero address)
      if (custody === '0x0000000000000000000000000000000000000000') {
        return null
      }

      // Get active signers (state = 1 means active)
      const ADDED_STATE = 1
      const activeKeys = await (keyRegistry as any).read.keysOf([
        fid,
        ADDED_STATE,
      ])

      // Get key types for each signer
      const signers: Array<{ key: string; keyType: number }> = []

      for (const key of activeKeys) {
        try {
          const keyData = await (keyRegistry as any).read.keyDataOf([fid, key])
          signers.push({
            key: key as string,
            keyType: Number(keyData.keyType),
          })
        } catch (error) {
          console.warn('Failed to get key data:', error)
          // Default to Ed25519 type (1) if we can't fetch
          signers.push({
            key: key as string,
            keyType: 1,
          })
        }
      }

      return {
        fid,
        custody: custody as string,
        recovery: recovery as string,
        signers,
      }
    } catch (error) {
      console.error('Error fetching on-chain Farcaster data:', error)
      return null
    }
  }

  private async getATProtoData(fid: bigint) {
    // TODO: Replace with actual smart contract call when deployed
    // For now, return placeholder data
    return {
      handle: `fid-${fid}.bsky.social`,
      signingKey: 'zQ3shunBKsXixLxNA3HC2jVDpBrKaJuTkJKwYfvHMCDYdQN47',
      pdsEndpoint: 'https://bsky.social',
    }
  }

  private buildDIDDocument(did: string, onChainData: any, atProtoData: any) {
    const verificationMethods: any[] = []
    const services: any[] = []
    const alsoKnownAs: string[] = []

    // Add custody address as #farcaster verification method
    const custodyVmId = `${did}#farcaster`
    verificationMethods.push({
      id: custodyVmId,
      type: 'EcdsaSecp256k1RecoveryMethod2020',
      controller: did,
      blockchainAccountId: `eip155:${optimism.id}:${onChainData.custody}`,
    })

    // Add recovery address if it exists
    if (onChainData.recovery !== '0x0000000000000000000000000000000000000000') {
      const recoveryVmId = `${did}#farcaster-recovery`
      verificationMethods.push({
        id: recoveryVmId,
        type: 'EcdsaSecp256k1RecoveryMethod2020',
        controller: did,
        blockchainAccountId: `eip155:${optimism.id}:${onChainData.recovery}`,
      })
    }

    // Add Farcaster signers with proper indexing
    onChainData.signers.forEach((signer: any, index: number) => {
      const signerVmId = `${did}#farcaster-signer-${index}`

      // KeyType 1 = Ed25519
      if (signer.keyType === 1) {
        // Remove 0x prefix and handle Ed25519 keys
        const keyHex = signer.key.startsWith('0x')
          ? signer.key.slice(2)
          : signer.key

        verificationMethods.push({
          id: signerVmId,
          type: 'Ed25519VerificationKey2020',
          controller: did,
          publicKeyHex: keyHex,
        })
      } else if (signer.keyType === 2) {
        // KeyType 2 = Secp256k1
        // trim the signer key to the trailing 40 hex chars Ethereum address
        const keyHex = signer.key.slice(-40)

        verificationMethods.push({
          id: signerVmId,
          type: 'EcdsaSecp256k1RecoveryMethod2020',
          controller: did,
          blockchainAccountId: `eip155:0x${keyHex}`,
        })
      }
    })

    // Add AT Protocol verification method
    if (atProtoData.signingKey) {
      const atprotoVmId = `${did}#atproto`
      verificationMethods.push({
        id: atprotoVmId,
        type: 'Multikey',
        controller: did,
        publicKeyMultibase: atProtoData.signingKey,
      })
    }

    // Add alsoKnownAs with AT Protocol handle
    if (atProtoData.handle) {
      alsoKnownAs.push(`at://${atProtoData.handle}`)
    }

    // Add Farcaster profile service
    services.push({
      id: `${did}#farcaster-profile`,
      type: 'FarcasterProfile',
      serviceEndpoint: 'https://farcaster.xyz/',
    })

    // Add AT Protocol PDS service
    if (atProtoData.pdsEndpoint) {
      services.push({
        id: '#atproto_pds',
        type: 'AtprotoPersonalDataServer',
        serviceEndpoint: atProtoData.pdsEndpoint,
      })
    }

    const document: any = {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/multikey/v1',
        'https://w3id.org/security/suites/secp256k1-2019/v1',
      ],
      id: did,
      verificationMethod: verificationMethods,
      service: services,
    }

    // Only add arrays if they have content
    if (alsoKnownAs.length > 0) {
      document.alsoKnownAs = alsoKnownAs
    }

    return document
  }
}
