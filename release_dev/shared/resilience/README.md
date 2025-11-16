# Resilience Patterns Library

> Enterprise-grade fault tolerance patterns for the MCP Bundle v2.0

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6.3+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20.0.0+-green.svg)](https://nodejs.org/)
[![Test Coverage](https://img.shields.io/badge/Coverage-80.58%25-brightgreen.svg)](./tests/)
[![License](https://img.shields.io/badge/License-UNLICENSED-red.svg)](./LICENSE)

## Quick Links

- **[Comprehensive Guide](./RESILIENCE_GUIDE.md)** - Full documentation with examples
- **[API Reference](./src/)** - TypeScript definitions and source code
- **[Tests](./tests/)** - Unit tests and examples

## Overview

The Resilience Patterns Library provides three core fault tolerance patterns:

1. **Retry Logic** - Exponential backoff with jitter
2. **Circuit Breaker** - Prevent cascading failures
3. **Timeout Handling** - Resource cleanup and fail-fast

## Installation

```typescript
import { retry, CircuitBreaker, withTimeout } from '@mcp-bundle/resilience';
```

## Quick Start

### Retry

```typescript
const result = await retry(
  async () => await apiClient.fetchData(),
  { maxAttempts: 3, baseDelay: 1000 }
);
```

### Circuit Breaker

```typescript
const breaker = new CircuitBreaker({ failureThreshold: 5 });
const data = await breaker.execute(async () => await apiCall());
```

### Timeout

```typescript
const result = await withTimeout(
  async () => await longOperation(),
  { timeout: 5000 }
);
```

## Features

- ✅ **Zero Runtime Dependencies** - Lightweight and fast
- ✅ **TypeScript First** - Full type safety with strict mode
- ✅ **Battle-Tested** - 80%+ code coverage, 65+ tests
- ✅ **Configurable** - Extensive options with sensible defaults
- ✅ **Observable** - Built-in logging and metrics support

## Test Results

```
Test Files  3 passed (3)
     Tests  65 passed (65)
  Duration  1.20s

Coverage
  Statements: 80.58%
  Branches:   90.59%
  Functions:  88.88%
  Lines:      80.58%
```

## Documentation

See [RESILIENCE_GUIDE.md](./RESILIENCE_GUIDE.md) for:

- Detailed API documentation
- Configuration options
- Integration examples for all MCP servers
- Best practices and troubleshooting
- Performance considerations

## Integration Status

- ⏳ **perplexity-mcp** - Pending integration
- ⏳ **mcp-orchestrator** - Pending integration
- ⏳ **soc-hub-mcp** - Pending integration
- ⏳ **itjsst-mcp** - Pending integration

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Watch tests
npm run test:watch

# Coverage
npm run test:coverage

# Type check
npm run type-check
```

## Architecture

### Retry Logic

- Exponential backoff: `delay = baseDelay * (multiplier ^ attempt)`
- Jitter: ±20% randomness to prevent thundering herd
- Specialized functions for network, database, and Redis operations

### Circuit Breaker

- Three states: CLOSED → OPEN → HALF_OPEN → CLOSED
- Rolling window for failure tracking
- Configurable thresholds and timeouts
- Observable state changes

### Timeout

- Promise.race based implementation
- Automatic cleanup on timeout
- AbortController integration
- Callback support

## Performance

- **Retry overhead**: < 0.1ms
- **Circuit breaker overhead**: < 0.1ms (CLOSED), 0ms (OPEN)
- **Timeout overhead**: ~ 1ms (Promise.race)
- **Memory footprint**: Minimal (no large buffers)

## License

UNLICENSED - Internal use within MCP Bundle v2.0

## Support

For questions or issues, contact the MCP Bundle development team.

---

**Version**: 1.0.0
**Built with** ❤️ **for the MCP Bundle v2.0 Upgrade Project**
