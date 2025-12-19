#!/bin/bash

# Jetson Thor System Diagnostics for Isaac Sim
# Run this script BEFORE building/running the container to verify setup

echo "============================================"
echo "Jetson Thor - Isaac Sim Diagnostics"
echo "============================================"
echo ""

# Check architecture
echo "1. Checking System Architecture..."
ARCH=$(uname -m)
echo "   Architecture: $ARCH"
if [ "$ARCH" != "aarch64" ]; then
    echo "   ⚠️  WARNING: Not running on ARM64 (aarch64). Are you on Jetson?"
else
    echo "   ✅ ARM64 architecture confirmed"
fi
echo ""

# Check JetPack version
echo "2. Checking JetPack Version..."
if command -v dpkg &> /dev/null; then
    JETPACK=$(dpkg -l | grep nvidia-jetpack | awk '{print $3}' | head -n1)
    if [ -z "$JETPACK" ]; then
        echo "   ⚠️  WARNING: JetPack not found. Install JetPack 6.0+ for Jetson Thor"
    else
        echo "   JetPack Version: $JETPACK"
        echo "   ✅ JetPack detected"
    fi
else
    echo "   ⚠️  Cannot check JetPack version"
fi
echo ""

# Check NVIDIA driver
echo "3. Checking NVIDIA Drivers..."
if command -v nvidia-smi &> /dev/null; then
    echo "   ✅ nvidia-smi available"
    nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader
else
    echo "   ⚠️  WARNING: nvidia-smi not found"
fi
echo ""

# Check Docker
echo "4. Checking Docker Installation..."
if command -v docker &> /dev/null; then
    echo "   ✅ Docker installed"
    DOCKER_VERSION=$(docker --version)
    echo "   $DOCKER_VERSION"
else
    echo "   ❌ ERROR: Docker not installed!"
    echo "   Install with: curl -fsSL https://get.docker.com | sh"
fi
echo ""

# Check NVIDIA Container Toolkit
echo "5. Checking NVIDIA Container Toolkit..."
if docker info 2>/dev/null | grep -q nvidia; then
    echo "   ✅ NVIDIA runtime detected"
    docker info 2>/dev/null | grep -A5 "Runtimes:"
else
    echo "   ❌ ERROR: NVIDIA Container Toolkit not properly configured"
    echo "   Install with:"
    echo "   sudo apt-get install nvidia-container-toolkit"
    echo "   sudo systemctl restart docker"
fi
echo ""

# Test GPU access in Docker
echo "6. Testing GPU Access in Docker..."
if docker run --rm --runtime nvidia --gpus all nvcr.io/nvidia/l4t-base:r36.2.0 nvidia-smi &> /dev/null; then
    echo "   ✅ Docker can access GPU"
else
    echo "   ⚠️  WARNING: Cannot test GPU in Docker (image may not be available)"
    echo "   Try: docker run --rm --runtime nvidia --gpus all nvcr.io/nvidia/l4t-base:r36.2.0 nvidia-smi"
fi
echo ""

# Check disk space
echo "7. Checking Disk Space..."
DISK_AVAIL=$(df -h / | awk 'NR==2 {print $4}')
DISK_AVAIL_GB=$(df -BG / | awk 'NR==2 {print $4}' | sed 's/G//')
echo "   Available: $DISK_AVAIL"
if [ "$DISK_AVAIL_GB" -lt 50 ]; then
    echo "   ⚠️  WARNING: Less than 50GB available. Isaac Sim needs ~40GB+"
else
    echo "   ✅ Sufficient disk space"
fi
echo ""

# Check memory
echo "8. Checking System Memory..."
if command -v free &> /dev/null; then
    TOTAL_MEM=$(free -h | awk '/^Mem:/ {print $2}')
    echo "   Total Memory: $TOTAL_MEM"
    echo "   ✅ Memory info available"
    echo "   Note: Monitor with 'tegrastats' during operation"
else
    echo "   ⚠️  Cannot check memory"
fi
echo ""

# Check X11 display
echo "9. Checking Display Configuration..."
if [ -z "$DISPLAY" ]; then
    echo "   ⚠️  WARNING: DISPLAY not set. GUI may not work"
    echo "   Set with: export DISPLAY=:0"
else
    echo "   DISPLAY=$DISPLAY"
    echo "   ✅ Display configured"
fi
echo ""

# Check X11 authorization
echo "10. Checking X11 Authorization..."
if [ -z "$XAUTHORITY" ]; then
    echo "   ⚠️  WARNING: XAUTHORITY not set"
    echo "   Default: ~/.Xauthority"
else
    echo "   XAUTHORITY=$XAUTHORITY"
    if [ -f "$XAUTHORITY" ]; then
        echo "   ✅ XAUTHORITY file exists"
    else
        echo "   ⚠️  WARNING: XAUTHORITY file not found"
    fi
fi
echo ""

# Summary
echo "============================================"
echo "SUMMARY & RECOMMENDATIONS"
echo "============================================"
echo ""

ERROR_COUNT=0
WARNING_COUNT=0

if [ "$ARCH" != "aarch64" ]; then
    echo "❌ Not running on ARM64 - Are you on Jetson Thor?"
    ERROR_COUNT=$((ERROR_COUNT + 1))
fi

if [ -z "$JETPACK" ]; then
    echo "⚠️  JetPack not detected - Install JetPack 6.0+ for Thor"
    WARNING_COUNT=$((WARNING_COUNT + 1))
fi

if ! command -v docker &> /dev/null; then
    echo "❌ Docker not installed - Install Docker first"
    ERROR_COUNT=$((ERROR_COUNT + 1))
fi

if ! docker info 2>/dev/null | grep -q nvidia; then
    echo "❌ NVIDIA Container Toolkit not configured"
    ERROR_COUNT=$((ERROR_COUNT + 1))
fi

if [ "$DISK_AVAIL_GB" -lt 50 ]; then
    echo "⚠️  Low disk space - Free up at least 50GB"
    WARNING_COUNT=$((WARNING_COUNT + 1))
fi

if [ -z "$DISPLAY" ]; then
    echo "⚠️  DISPLAY not set - Needed for GUI"
    WARNING_COUNT=$((WARNING_COUNT + 1))
fi

echo ""
echo "Errors: $ERROR_COUNT | Warnings: $WARNING_COUNT"
echo ""

if [ $ERROR_COUNT -eq 0 ] && [ $WARNING_COUNT -eq 0 ]; then
    echo "✅ System appears ready for Isaac Sim on Jetson Thor!"
    echo ""
    echo "Next steps:"
    echo "1. Verify Dockerfile uses Jetson-compatible base image"
    echo "2. Build: ./scripts/build.sh"
    echo "3. Run: ./scripts/jetson_run.sh"
    echo ""
    echo "See JETSON_THOR_SETUP.md for complete guide"
elif [ $ERROR_COUNT -eq 0 ]; then
    echo "⚠️  Some warnings detected. Review above and proceed with caution."
    echo "See JETSON_THOR_SETUP.md for troubleshooting"
else
    echo "❌ Critical errors detected. Fix these before proceeding."
    echo "See JETSON_THOR_SETUP.md for setup instructions"
fi

echo "============================================"

