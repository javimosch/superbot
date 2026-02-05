# Telegram allowFrom Guardrail

## Overview
The Telegram channel supports an `allowFrom` guardrail that restricts bot usage to specific users. This feature provides security by ensuring only authorized users can interact with the bot.

## Configuration

### Config File
```json
{
  "telegram": {
    "enabled": true,
    "token": "BOT_TOKEN",
    "allowFrom": ["8292412122", "john_doe"]
  }
}
```

### Environment Variable
```bash
TELEGRAM_ALLOW_FROM=8292412122,john_doe,another_user
```

## Implementation Details

### Config Schema
- Added `allowFrom` property to telegram config in `config/schema.js`
- Defaults to empty array `[]` which allows all users (backward compatible)
- Supports both file configuration and environment variable override

### Permission Checking
- Implemented `isAllowed(senderId)` method in `BaseChannel` class
- Checks permissions before processing any message in `_handleMessage()`
- Logs blocked attempts for security monitoring

### Sender ID Format
- Telegram channel constructs senderId as `"user_id|username"` when username is available
- Supports matching against both numeric user IDs and usernames
- Compatible with nanobot implementation for future migration

### Permission Logic
1. If `allowFrom` is empty or undefined, all users are allowed
2. Check for exact match with senderId
3. For senderId format `"user_id|username"`, check each part individually
4. Block unauthorized attempts with warning log

## Security Features

### Logging
- Authorized users: Debug level logging
- Unauthorized attempts: Warning level logging with sender ID
- All permission checks are logged for security monitoring

### Backward Compatibility
- Empty `allowFrom` array maintains current behavior (allow all)
- Existing configurations continue to work without modification
- No breaking changes to existing API

## Usage Examples

### Allow Specific Users
```json
{
  "telegram": {
    "enabled": true,
    "token": "BOT_TOKEN",
    "allowFrom": ["8292412122", "john_doe", "jane_smith"]
  }
}
```

### Allow Only by Username
```json
{
  "telegram": {
    "enabled": true,
    "token": "BOT_TOKEN",
    "allowFrom": ["john_doe", "jane_smith"]
  }
}
```

### Allow Only by User ID
```json
{
  "telegram": {
    "enabled": true,
    "token": "BOT_TOKEN",
    "allowFrom": ["8292412122", "123456789"]
  }
}
```

### Environment Variable Override
```bash
# Override config file setting
TELEGRAM_ALLOW_FROM=8292412122,john_doe
```

## Testing

### Test Cases
1. Empty allowFrom - all users allowed
2. Specific user IDs - only matching IDs allowed
3. Usernames - only matching usernames allowed
4. Mixed format - both IDs and usernames supported
5. Environment variable override
6. Blocked attempt logging

### Security Considerations
- Monitor logs for blocked attempts
- Use specific user IDs when possible for better security
- Regularly review allowFrom lists
- Consider using environment variables for sensitive configurations

## File Changes

### Modified Files
- `config/schema.js` - Added allowFrom to defaultConfig
- `config/index.js` - Added allowFrom loading with env var support
- `src/channels/base.js` - Added isAllowed method and permission checking
- `src/channels/telegram.js` - Updated senderId construction for compatibility

### Configuration Priority
1. Default config (empty array)
2. Config file values
3. Environment variable override (highest priority)

## Migration Notes
- Compatible with nanobot's allowFrom implementation
- Uses same senderId format for consistency
- No configuration migration required for existing setups
