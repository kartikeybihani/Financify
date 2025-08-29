#!/bin/bash

echo "🔧 Fixing Expo Development Build Connection Issues"
echo "=================================================="

echo ""
echo "1. 🔥 Checking macOS Firewall Settings..."

# Check if firewall is enabled
FIREWALL_STATUS=$(sudo /usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate 2>/dev/null | grep "Firewall is enabled" || echo "Firewall is disabled")
echo "   Firewall Status: $FIREWALL_STATUS"

if [[ "$FIREWALL_STATUS" == *"enabled"* ]]; then
    echo "   ⚠️  Firewall is enabled - this might block Metro connections"
    echo "   💡 You may need to allow Node.js through the firewall"
    echo "   📝 Go to: System Preferences > Security & Privacy > Firewall > Options"
    echo "   📝 Find Node.js and set it to 'Allow incoming connections'"
fi

echo ""
echo "2. 🌐 Testing Network Connectivity..."

# Get the current IP
IP=$(ipconfig getifaddr en0)
echo "   Your Mac's IP: $IP"

# Test if port 8081 is listening
PORT_TEST=$(netstat -an | grep "*.8081" | grep LISTEN)
if [[ -n "$PORT_TEST" ]]; then
    echo "   ✅ Port 8081 is listening"
else
    echo "   ❌ Port 8081 is not listening"
fi

echo ""
echo "3. 📱 iPhone Connection Checklist:"
echo "   □ iPhone and Mac on same WiFi network"
echo "   □ Local Network permission enabled for your app"
echo "   □ No VPN active on either device"
echo "   □ Corporate WiFi allows device-to-device communication"

echo ""
echo "4. 🛠️  Recommended Solutions:"
echo "   1. Try: npx expo start --host tunnel"
echo "   2. Use iPhone hotspot and connect Mac to it"
echo "   3. Rebuild development client: eas build --profile development --platform ios"
echo "   4. Clear Expo cache: npx expo start --clear"

echo ""
echo "5. 🔍 Debug URLs to test:"
echo "   - Metro server: http://localhost:8081"
echo "   - LAN access: http://$IP:8081"
echo "   - Development URL: exp+financify://expo-development-client/?url=http%3A%2F%2F$IP%3A8081"
