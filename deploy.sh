#!/bin/bash
echo "🛠️  Building project..."
npm run build

echo "🚀 Deploying to Firebase..."
 npx firebase deploy
