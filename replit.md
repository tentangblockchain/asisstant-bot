# Telegram Bot - Admin & Filter Management

## Overview
This is a Telegram bot for managing admin users and creating custom filters with support for various media types. The bot includes AI-powered conversations using Groq's LLaMA models.

## Project Structure
- `index.js` - Main bot application with all handlers and logic
- `package.json` - Node.js dependencies and scripts
- `admins.json` - Auto-generated file storing admin user IDs
- `filters.json` - Auto-generated file storing filter data
- `blacklist.json` - Auto-generated file storing blacklisted users

## Technology Stack
- **Runtime**: Node.js
- **Main Library**: node-telegram-bot-api
- **Environment Management**: dotenv
- **AI Integration**: Groq API (optional)

## Features
1. **Admin Management** - Add/remove admins, owner protection
2. **Filter Management** - Create filters with text, photos, videos, documents, etc.
3. **Security** - Blacklist system, timeout system, rate limiting
4. **AI Assistant (Hoki)** - Optional AI chat feature using Groq LLaMA models
5. **Auto-delete** - Automatic message cleanup

## Configuration
The bot requires the following environment variables:
- `BOT_TOKEN` - Telegram bot token from @BotFather (required)
- `OWNER_ID` - Telegram user ID of the bot owner from @userinfobot (required)
- `GROQ_API_KEY` - Groq API key for AI features (optional)

## Deployment Notes
This bot runs as a long-running process using Telegram's polling mechanism. It maintains in-memory caches for performance and saves data to JSON files.

## Recent Changes
- 2025-01-15: Imported from GitHub, fixed syntax errors, set up for Replit environment
