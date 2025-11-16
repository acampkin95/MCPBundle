# MCP Bundle v0.2.0 - SSH Keys Backup

**Created:** November 8, 2025
**Purpose:** Backup of ED25519 SSH keypairs for all 3 production servers

## Server Keys

### VMI01 - ACDEV-VMI01 (Primary)

- **Hostname:** acdev-vmi01.acdev.host
- **Public IP:** 46.250.243.123
- **Private IP:** 10.0.0.1/22
- **Private Key:** `vmi01-acdev-vmi01-id_ed25519`
- **Public Key:** `vmi01-acdev-vmi01-id_ed25519.pub`
- **Fingerprint:** SHA256:sN1Sg8MpYmOKVwSr4GZnkMlRiWA+D3GjwgkkGyuw+Xs
- **Comment:** vmi01-root@acdev.host

### VMI02 - ACDEV-VMI02 (Secondary/Storage)

- **Hostname:** acdev-vmi02.data.acdev.host
- **Public IP:** 46.250.241.70
- **Private IP:** 10.0.0.2/22
- **Private Key:** `vmi02-acdev-vmi02-id_ed25519`
- **Public Key:** `vmi02-acdev-vmi02-id_ed25519.pub`
- **Fingerprint:** SHA256:4wB95vA1uIzLDViVamp/gbN7bgwkhHYizTInUTksmvk
- **Comment:** vmi02-root@data.acdev.host

### VMI03 - ACDEV-VMI03 (Gateway/Security)

- **Hostname:** acdev-vmi03.auth.acdev.host
- **Public IP:** 154.26.158.31
- **Private IP:** 10.0.0.3/22
- **Private Key:** `vmi03-acdev-vmi03-id_ed25519`
- **Public Key:** `vmi03-acdev-vmi03-id_ed25519.pub`
- **Fingerprint:** SHA256:aNM382nr43Iqq7XOOYtyPOUxb7ewTCXv0QTiteryiBM
- **Comment:** vmi03-root@auth.acdev.host

## Key Exchange Status

All servers have passwordless SSH authentication configured:

- ✅ VMI01 can access VMI02 and VMI03
- ✅ VMI02 can access VMI01 and VMI03
- ✅ VMI03 can access VMI01 and VMI02

## Security Notes

1. **Private Keys:**
   - All private keys are stored with `600` permissions (read/write owner only)
   - Keep these files secure and encrypted
   - Never commit to public repositories

2. **Authorized Keys:**
   - All public keys are added to `/root/.ssh/authorized_keys` on all servers
   - This enables inter-VM communication over private LAN (10.0.0.0/22)

3. **Backup:**
   - Store this directory in a secure, encrypted location
   - Consider using encrypted cloud storage or password manager
   - Keep offline backup on encrypted USB drive

## Usage

To use these keys for SSH access:

```bash
# VMI01
ssh -i ssh-keys/vmi01-acdev-vmi01-id_ed25519 root@46.250.243.123

# VMI02
ssh -i ssh-keys/vmi02-acdev-vmi02-id_ed25519 root@46.250.241.70

# VMI03
ssh -i ssh-keys/vmi03-acdev-vmi03-id_ed25519 root@154.26.158.31
```

## Key Rotation

To rotate keys (recommended every 6-12 months):

1. Generate new ED25519 keypairs on each server
2. Update authorized_keys on all servers
3. Test passwordless SSH access
4. Remove old keys from authorized_keys
5. Update this backup directory
6. Securely delete old private keys

## Emergency Access

If these keys are lost or compromised:

1. Connect via server console (hosting provider panel)
2. Generate new keypairs
3. Update authorized_keys
4. Update backup

## Contact

**Rebuild Date:** November 8, 2025
**Version:** MCP Bundle v0.2.0
**Fail2Ban Whitelist:** 146.70.148.46 (admin IP)
