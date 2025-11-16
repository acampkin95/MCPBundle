# SOC Hub - Quick Start Guide

## 🚀 Fix Everything in 55 Minutes

### Step 1: Connect to Server
```bash
ssh root@154.26.158.31
cd /opt/mcp/deployment/soc/
```

### Step 2: Fix Elasticsearch (10 min)
```bash
./fix-elasticsearch-aggregations.sh
```
**Result**: Aggregations working, 8 alerts added

### Step 3: Fix Wazuh (30 min)
```bash
./fix-wazuh-manager.sh
```
**Result**: Wazuh running, agents endpoint working

### Step 4: Deploy TheHive (15 min)
```bash
./deploy-thehive-docker.sh
```
**Result**: TheHive available at http://154.26.158.31:9000

### Step 5: Verify (from local machine)
```bash
curl -s http://154.26.158.31:3200/api/v1/health | jq '.data.services'
curl -s http://154.26.158.31:3200/api/v1/stats/elasticsearch | jq '.data.top_targets'
```

---

## 📖 Documentation

- **`EXECUTIVE_SUMMARY.md`** - Overview and status
- **`SOC_HUB_IMPROVEMENT_GUIDE.md`** - Complete procedures
- **`SOC_HUB_IMPROVEMENT_REPORT.md`** - Detailed findings

---

## 🔧 Troubleshooting

### If Elasticsearch fails:
```bash
systemctl restart elasticsearch
journalctl -u elasticsearch -n 50
```

### If Wazuh fails:
```bash
./fix-wazuh-manager.sh --clean-install
tail -f /var/ossec/logs/ossec.log
```

### If TheHive fails:
```bash
cd /opt/thehive
docker-compose logs -f
docker-compose restart
```

---

## ✅ Success Checklist

- [ ] Elasticsearch aggregations return data
- [ ] Wazuh service active
- [ ] TheHive accessible
- [ ] All API endpoints working
- [ ] Health check shows all healthy

---

**Total Time**: 55 minutes
**Difficulty**: Easy (automated)
**Status**: Ready to execute
