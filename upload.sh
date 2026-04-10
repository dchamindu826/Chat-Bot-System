#!/bin/bash

# 1. Database එක Backup කරලා Zip කරනවා
TIMESTAMP=$(date +"%F-%H-%M")
BACKUP_DIR="/root/apps/Chat-Bot-System/backups"
FILENAME="backup_$TIMESTAMP.tar.gz"

# Mongo Backup Script එක රන් කරනවා (JSON ෆයිල් හදන්න)
cd /root/apps/Chat-Bot-System
node backup_db.js

# අලුත්ම Backup ෆෝල්ඩර් එක හොයාගෙන Zip කරනවා
LATEST_FOLDER=$(ls -td -- */ | head -n 1)
tar -czf "$FILENAME" "$LATEST_FOLDER"

# 2. Google Drive එකට Upload කරනවා (Rclone හරහා)
echo "🚀 Uploading to Google Drive..."
rclone copy "$FILENAME" crm-backend:VPS_Backups

# 3. VPS එකේ ඉඩ ඉතුරු කරගන්න ෆයිල් මකනවා
rm "$FILENAME"
rm -rf "$LATEST_FOLDER"

echo "✅ Done! Check your Google Drive."
