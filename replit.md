# Telegram Bot - Admin & Filter Management

## Overview
This is a Telegram bot that provides admin management and custom filter features for Telegram groups. The bot allows admins to create custom responses (filters) that can include text, photos, videos, documents, and other media types.

## Purpose
- Manage group admins with role-based permissions
- Create custom filters/commands for automated responses
- Support multimedia filters (text, images, videos, documents, etc.)
- Auto-delete command messages to keep chats clean

## Recent Changes
- **November 15, 2025**: Initial project setup in Replit environment
  - Created package.json with required dependencies
  - Added .env.example for configuration guidance
  - Set up .gitignore for Node.js
  - Configured workflow to run the bot

## Project Architecture

### Tech Stack
- **Runtime**: Node.js 20
- **Main Dependencies**:
  - `node-telegram-bot-api`: Telegram Bot API wrapper
  - `dotenv`: Environment variable management

### File Structure
- `index.js`: Main bot application with all commands and handlers
- `admins.json`: Persistent storage for admin user IDs (auto-generated)
- `filters.json`: Persistent storage for custom filters (auto-generated)
- `.env`: Environment configuration (must be created)
- `.env.example`: Template for environment variables

### Required Environment Variables
- `BOT_TOKEN`: Your Telegram bot token from @BotFather
- `OWNER_ID`: Your Telegram user ID (from @userinfobot)

## Features

### Admin Management
- `/addadmin`: Add a new admin (reply to their message)
- `/removeadmin`: Remove an admin (reply to their message)
- `/listadmins`: List all admins
- Owner (OWNER_ID) cannot be removed

### Filter Management
- `!add <name>`: Create a new filter (reply to the message you want to save)
- `!del <name>`: Delete a filter
- `!list`: List all filters with pagination
- `!status`: Show bot status and statistics
- Trigger filters by typing `!filtername` or just `filtername`

### Supported Media Types
- Text messages with formatting
- Photos
- Videos
- Documents
- Animations (GIFs)
- Audio
- Voice messages
- Stickers

### Auto-Delete Feature
- Command messages auto-delete after 3 minutes
- Response messages auto-delete after 5 minutes
- Keeps group chat clean

## Setup Instructions

1. Get your bot token from @BotFather on Telegram
2. Get your user ID from @userinfobot on Telegram
3. Add these as Replit Secrets:
   - `BOT_TOKEN`: Your bot token
   - `OWNER_ID`: Your user ID
4. The bot will start automatically

## How to Use

### First Time Setup
1. Add the bot to your Telegram group
2. Make the bot an admin in the group
3. The owner (OWNER_ID) is automatically added as the main admin

### Creating Filters
1. Send the message/media you want to save as a filter
2. Reply to that message with `!add <name>`
3. Example: `!add welcome` to create a welcome filter

### Using Filters
- Type `!filtername` or just `filtername` to trigger the filter
- The bot will send the saved message/media

### Managing Admins
1. To add an admin: reply to their message with `/addadmin`
2. To remove an admin: reply to their message with `/removeadmin`
3. Use `/listadmins` to see all admins

## Current State
The bot is fully configured and ready to run. Once you provide the required environment variables (BOT_TOKEN and OWNER_ID), it will connect to Telegram and start processing commands.

## Notes
- The bot uses polling mode to receive updates
- Data is stored in local JSON files (admins.json and filters.json)
- The owner ID is protected and cannot be removed from admin list
- All admin commands require admin privileges
