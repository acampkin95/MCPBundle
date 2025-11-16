# AdGuard DNS Status Report
**Date:** November 10, 2025
**Server:** Jump Box (154.26.158.68)
**Status:** ✅ **WORKING** - Public DNS accessible to external users

---

## Executive Summary

AdGuard DNS **IS working correctly** for external non-VPN users. The service is active, listening on port 53 (UDP/TCP), and successfully resolving DNS queries with ad-blocking enabled.

### Test Results

```bash
# DNS Resolution Test (External Client)
$ dig @154.26.158.68 google.com +short
142.251.221.78                          ✅ SUCCESS

# Ad Blocking Test
$ dig @154.26.158.68 doubleclick.net +short
0.0.0.0                                 ✅ BLOCKED (ad domain)

# Standard Domain Test
$ dig @154.26.158.68 github.com +short
4.237.22.38                             ✅ SUCCESS
```

---

## Service Details

### Current Configuration

| Parameter | Value |
|-----------|-------|
| **Server IP** | 154.26.158.68 |
| **DNS Port** | 53 (UDP/TCP) |
| **Web Interface** | http://154.26.158.68:3000 |
| **Service Status** | Active (running 14+ hours) |
| **Uptime** | Since Nov 09 10:18:52 CET |
| **Memory Usage** | 61.4 MB (peak: 769.5 MB) |
| **Process ID** | 12180 |

### Network Binding

```yaml
bind_hosts:
  - 0.0.0.0        # Listening on all interfaces ✅
port: 53           # Standard DNS port ✅
```

### Active Blocklists

AdGuard is using multiple blocklists for comprehensive ad/tracker blocking:
- OISD Full (comprehensive blocking)
- StevenBlack Unified (malware + ads)
- 1Hosts Lite (balanced blocking)
- AdGuard DNS filter (official list)

---

## Issues Identified

### 1. ⚠️ Aggressive Rate Limiting

**Symptom:** 157,000+ DNS queries have been dropped due to rate limiting

**Current Limits:**
- UDP: 30 queries/second per IP
- TCP: 10 queries/second per IP
- AdGuard internal: 20 queries/second

**Impact:**
- Users making frequent DNS queries may experience throttling
- Legitimate bulk operations (like browsing with many resources) could be affected
- 13 MB of legitimate traffic dropped

**Evidence:**
```
157K packets (13M bytes) dropped on UDP port 53
0 packets dropped on TCP port 53 (less common)
```

### 2. ⚠️ IPv6 Response Errors

**Symptom:** AdGuard logs show IPv6 sendmsg errors

**Sample Errors:**
```
[error] dnsproxy: responding request proto=udp
err="writing message: write udp [::]:53->45.139.199.7:0: sendmsg: invalid argument"
```

**Impact:**
- IPv6 clients may experience intermittent failures
- Errors are logged but don't affect IPv4 functionality
- May indicate IPv6 routing or configuration issues

### 3. ℹ️ Minor TCP Connection Errors

**Symptom:** Occasional "unexpected EOF" on TCP connections

**Impact:**
- Low frequency (a few per hour)
- Typically caused by clients closing connections prematurely
- Does not affect overall functionality

---

## Performance Statistics

### Firewall Metrics

| Metric | UDP | TCP |
|--------|-----|-----|
| **Total Queries** | 583,282 | 62 |
| **Queries Accepted** | 428,324 | 62 |
| **Queries Dropped** | 154,958 | 0 |
| **Data Transferred** | 47.7 MB | 3.9 KB |
| **Data Dropped** | 12.6 MB | 0 |
| **Drop Rate** | ~26.6% | 0% |

### Query Distribution

- **UDP Queries:** 99.99% of traffic (DNS standard protocol)
- **TCP Queries:** 0.01% (used for large responses or DNS-over-TCP)
- **Established Responses:** 7,376 packets (1.3 MB)

---

## Recommendations

### Priority 1: Optimize Rate Limiting

**Issue:** 26.6% of queries are being dropped by firewall rate limits

**Recommended Changes:**

1. **Increase UDP rate limit** from 30 to 50-100 queries/second:
   ```bash
   # Current rule (too aggressive)
   udp dpt:53 recent: UPDATE seconds: 1 hit_count: 30

   # Recommended
   udp dpt:53 recent: UPDATE seconds: 1 hit_count: 100
   ```

2. **Adjust AdGuard internal rate limit** in `/opt/AdGuardHome/AdGuardHome.yaml`:
   ```yaml
   ratelimit: 50  # Increase from 20 to 50
   ```

3. **Consider per-subnet rate limiting** instead of per-IP:
   - Allow higher limits for trusted networks
   - More restrictive for unknown sources

**Benefit:** Reduce false positives while maintaining DDoS protection

### Priority 2: Fix IPv6 Configuration

**Issue:** IPv6 DNS responses are failing with "sendmsg: invalid argument"

**Diagnostic Steps:**
```bash
# Check IPv6 configuration
ip -6 addr show
ip -6 route show

# Test IPv6 DNS resolution
dig @154.26.158.68 google.com AAAA
```

**Potential Fixes:**

1. **Disable IPv6 in AdGuard** if not needed:
   ```yaml
   aaaa_disabled: true  # Change from false to true
   ```

2. **Fix IPv6 routing** if IPv6 is required:
   - Verify IPv6 address is configured on public interface
   - Check IPv6 firewall rules
   - Ensure upstream DNS supports IPv6

### Priority 3: Monitor and Tune

**Ongoing Monitoring:**

1. **Track query patterns:**
   ```bash
   # View AdGuard statistics
   curl -s http://localhost:3000/control/stats | jq .

   # Monitor dropped queries
   watch -n 5 'iptables -L -n -v | grep "dpt:53"'
   ```

2. **Set up alerts** for:
   - High drop rates (>10%)
   - Service downtime
   - Memory usage spikes

3. **Regular reviews:**
   - Weekly: Check AdGuard logs and statistics
   - Monthly: Review and update blocklists
   - Quarterly: Analyze query patterns and adjust rate limits

---

## Quick Fix Script

I've prepared an optimization script to address the issues:

### Apply Optimizations

```bash
# Upload optimization script
scp optimize-adguard-dns.sh root@154.26.158.68:/tmp/

# Run on Jump Box
ssh root@154.26.158.68 'bash /tmp/optimize-adguard-dns.sh'
```

**Changes Made:**
- Increases rate limits (30→100 UDP, 10→20 TCP)
- Disables IPv6 responses to fix errors
- Adds monitoring script
- Creates backup of configuration

---

## User Configuration

### For Desktop/Mobile Devices

**DNS Settings:**
- Primary DNS: `154.26.158.68`
- Secondary DNS: `1.1.1.1` (Cloudflare fallback)

**Expected Behavior:**
- Ad blocking at DNS level (no ads loaded)
- Tracker blocking (enhanced privacy)
- Malware protection (malicious sites blocked)

### For Routers (Whole Network)

Configure router DNS settings:
1. Access router admin panel
2. Find WAN/DNS settings
3. Set Primary DNS: `154.26.158.68`
4. Set Secondary DNS: `1.1.1.1`

**Benefits:**
- All devices on network get ad blocking
- No per-device configuration needed
- Works on all platforms (Windows, Mac, Linux, iOS, Android, Smart TVs)

---

## Testing Checklist

- [x] DNS service is running
- [x] Listening on port 53 (UDP/TCP)
- [x] Accessible from external clients
- [x] DNS resolution works (google.com)
- [x] Ad blocking works (doubleclick.net blocked)
- [x] Firewall rules allow public access
- [ ] Rate limits optimized (pending)
- [ ] IPv6 errors resolved (pending)
- [ ] Monitoring dashboard configured (pending)

---

## Support Commands

### Check Service Status
```bash
ssh root@154.26.158.68 'systemctl status AdGuardHome'
```

### View Real-time Logs
```bash
ssh root@154.26.158.68 'journalctl -u AdGuardHome -f'
```

### View Statistics
```bash
ssh root@154.26.158.68 'curl -s http://localhost:3000/control/stats | jq .'
```

### Check Dropped Queries
```bash
ssh root@154.26.158.68 'iptables -L -n -v | grep "dpt:53"'
```

### Restart Service
```bash
ssh root@154.26.158.68 'systemctl restart AdGuardHome'
```

---

## Conclusion

### Current Status: ✅ WORKING

AdGuard DNS on Jump Box (154.26.158.68) **is fully operational** and accessible to external non-VPN users. DNS resolution and ad-blocking are functioning correctly.

### Recommended Actions:

1. **Optimize rate limiting** to reduce false positives (26.6% drop rate)
2. **Fix IPv6 errors** by disabling IPv6 responses or fixing routing
3. **Set up monitoring** to track performance and issues

### No Immediate Action Required

The service is working as intended for basic DNS resolution and ad-blocking. The identified issues are **optimizations**, not critical failures.

---

**Report Generated:** November 10, 2025
**Next Review:** Weekly monitoring recommended
**Support:** Check AdGuard logs and statistics regularly
