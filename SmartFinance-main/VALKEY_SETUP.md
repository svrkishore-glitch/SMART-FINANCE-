# Valkey Setup Guide for SmartFinance

This guide covers installing and configuring Valkey (the open-source Redis fork) for use as a caching layer in SmartFinance.

## Table of Contents

1. [What is Valkey?](#what-is-valkey)
2. [Installation](#installation)
   - [Ubuntu/Debian](#ubuntu-debian)
   - [macOS](#macos)
   - [Windows (WSL2)](#windows-wsl2)
3. [Starting Valkey Server](#starting-valkey-server)
4. [Installing iovalkey Package](#installing-iovalkey-package)
5. [Configuring SmartFinance](#configuring-smartfinance)
6. [Verification](#verification)
7. [Troubleshooting](#troubleshooting)

## What is Valkey?

Valkey is an open-source fork of Redis that aims to keep Redis truly open-source. It provides the same API and functionality as Redis while being community-driven.

## Installation

### Ubuntu/Debian

```bash
# Update package list
sudo apt update

# Install valkey (available in Ubuntu 24.04+)
sudo apt install valkey

# For older Ubuntu versions, you can build from source:
# git clone https://github.com/valkey-io/valkey.git
# cd valkey
# make
# sudo make install
```

### macOS

```bash
# Using Homebrew (if available)
# brew install valkey

# Or install via source
git clone https://github.com/valkey-io/valkey.git
cd valkey
make
sudo make install
```

### Windows (WSL2)

If you're on Windows, the easiest way to run Valkey is through WSL2:

```bash
# Install WSL2 if not already installed
wsl --install

# Open Ubuntu and run:
sudo apt update
sudo apt install valkey
```

## Starting Valkey Server

### Development (local machine)

```bash
# Start with default settings (localhost:6379)
valkey-server

# Or with custom port
valkey-server --port 6380

# Or in background
valkey-server --daemonize yes
```

### Production

```bash
# Create a configuration file
sudo nano /etc/valkey/valkey.conf

# Key settings to consider:
# bind 127.0.0.1 (or your server IP)
# port 6379
# requirepass your-password-here

# Start with config file
valkey-server /etc/valkey/valkey.conf
```

### Docker

```bash
# Run Valkey container
docker run -d --name valkey -p 6379:6379 valkey-io/valkey:latest

# With custom config
docker run -d --name valkey -p 6379:6379 \
  -v /path/to/valkey.conf:/etc/valkey/valkey.conf \
  valkey-io/valkey:latest
```

## Installing iovalkey Package

```bash
# Navigate to your SmartFinance project
cd /path/to/SmartFinance

# Install the package (this is already in package.json)
npm install
```

## Configuring SmartFinance

### 1. Add VALKEY_URL to .env

If you have an existing `.env` file, add the Valkey connection string:

```bash
# .env file
VALKEY_URL=redis://127.0.0.1:6379
```

### 2. Or create .env from .env.example

```bash
cp .env.example .env
# Edit .env and add your actual API keys
```

### 3. Verify connection

Start your SmartFinance server and check the cache status:

```bash
npm start
```

Then visit: `http://localhost:3000/api/cache/status`

Expected response:
```json
{
  "connected": true,
  "keyCount": 0,
  "memoryUsed": "1.00M"
}
```

## Verification

### Test Cache is Working

1. Make a GET request to any cached endpoint:
   ```bash
   curl http://localhost:3000/api/categories
   ```

2. Check cache status again:
   ```bash
   curl http://localhost:3000/api/cache/status
   ```

3. You should see increased key count

### Test Cache Invalidation

1. Make a POST request to create a transaction:
   ```bash
   curl -X POST http://localhost:3000/api/transactions \
     -H "Content-Type: application/json" \
     -d '{"category_id":1,"amount":100,"date":"2025-05-14","description":"Test"}'
   ```

2. Verify cache keys were invalidated (should decrease)

### Test Graceful Degradation

1. Stop the Valkey server:
   ```bash
   valkey-cli shutdown
   ```

2. Make an API request to SmartFinance - it should still work!

3. Restart Valkey:
   ```bash
   valkey-server
   ```

## Troubleshooting

### Connection Refused

```bash
# Check if Valkey is running
valkey-cli ping

# Should return: PONG

# If not, start the server first
valkey-server
```

### Authentication Required

If you set a password in valkey.conf:

```bash
# Connect with password
valkey-cli -a your-password

# Or in .env:
VALKEY_URL=redis://:your-password@127.0.0.1:6379
```

### Port Already in Use

```bash
# Find what's using the port
sudo lsof -i :6379

# Or use a different port
valkey-server --port 6380
VALKEY_URL=redis://127.0.0.1:6380
```

### Check Valkey Logs

```bash
# View logs
valkey-cli info

# Or check log file (default: /var/log/valkey/valkey.log)
```

## Summary

Once set up, Valkey will automatically cache API responses, significantly improving response times for repeated queries. The cache is transparent - if Valkey goes down, the API continues working by falling back to direct database queries.