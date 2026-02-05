# Plan: Add allowFrom Guardrail Support for Telegram in Superbot

## Overview
Add `allowFrom` guardrail functionality to superbot's telegram channel, similar to the implementation in ref-nanobot codebase.

## Analysis of ref-nanobot Implementation

### Key Components Found:
1. **Config Schema** (`schema.py`):
   - `TelegramConfig` class includes `allow_from: list[str]` field
   - Defaults to empty list (allows everyone when not specified)

2. **Base Channel** (`base.py`):
   - `is_allowed(sender_id: str) -> bool` method implements the guardrail logic
   - Checks if sender is in allow list
   - Supports both numeric IDs and usernames (with "|" separator)
   - Returns `True` if allow list is empty (allow everyone)

3. **Telegram Channel** (`telegram.py`):
   - Uses `is_allowed()` in `_handle_message()` before forwarding to message bus
   - Constructs sender_id as "user_id|username" for flexibility

## Implementation Status: ✅ COMPLETED

### Phase 1: Update Configuration Schema ✅
**File**: `config/schema.js`
- ✅ Added `allowFrom` property to telegram config in `defaultConfig`
- ✅ Default value: `[]` (empty array allows everyone)
- ✅ Maintains backward compatibility

### Phase 2: Update Configuration Loading ✅
**File**: `config/index.js`
- ✅ Added support for loading `telegram.allowFrom` from config file
- ✅ Added environment variable support: `TELEGRAM_ALLOW_FROM` (comma-separated)
- ✅ Proper string trimming and array parsing

### Phase 3: Update Base Channel ✅
**File**: `src/channels/base.js`
- ✅ Added `isAllowed(senderId)` method to BaseChannel class
- ✅ Implemented logic:
  - If allowFrom is empty or undefined, return true
  - Check if senderId matches any entry in allowFrom array
  - Support both numeric IDs and usernames
  - Handle "|" separator format for compatibility
- ✅ Added permission checking in `_handleMessage()` before processing
- ✅ Added warning logs for blocked attempts

### Phase 4: Update Telegram Channel ✅
**File**: `src/channels/telegram.js`
- ✅ Modified message handler to construct senderId with "user_id|username" format
- ✅ Permission checking automatically handled by base class
- ✅ Maintains all existing functionality

### Phase 5: Documentation ✅
**File**: `docs/features/telegram-allowFrom.md`
- ✅ Comprehensive documentation created
- ✅ Configuration examples provided
- ✅ Security considerations documented
- ✅ Implementation details recorded

## Configuration Examples

### Basic allowlist:
```json
{
  "telegram": {
    "enabled": true,
    "token": "BOT_TOKEN",
    "allowFrom": ["8292412122", "john_doe"]
  }
}
```

### Environment variable:
```bash
TELEGRAM_ALLOW_FROM=8292412122,john_doe,another_user
```

## Security Considerations
1. ✅ **Default behavior**: Empty allowFrom allows everyone (current behavior preserved)
2. ✅ **Logging**: Log blocked attempts for security monitoring
3. ✅ **Format flexibility**: Support both numeric IDs and usernames
4. ✅ **Compatibility**: Use same format as nanobot for consistency

## Testing Strategy
1. ✅ Test with empty allowFrom (should allow all)
2. ✅ Test with specific user IDs
3. ✅ Test with usernames
4. ✅ Test with mixed formats
5. ✅ Test environment variable override
6. ✅ Test blocked attempt logging

## Implementation Notes
- ✅ Maintains backward compatibility
- ✅ Uses same senderId format as nanobot for future migration compatibility
- ✅ Consider adding similar support to WhatsApp channel for consistency
- ✅ All changes are minimal and focused
- ✅ No breaking changes introduced

## Files Modified
- `config/schema.js` - Added allowFrom to defaultConfig
- `config/index.js` - Added allowFrom loading with env var support  
- `src/channels/base.js` - Added isAllowed method and permission checking
- `src/channels/telegram.js` - Updated senderId construction for compatibility
- `docs/features/telegram-allowFrom.md` - Created comprehensive documentation

## Summary
The allowFrom guardrail feature has been successfully implemented for the Telegram channel in superbot. The implementation follows the same pattern as ref-nanobot, maintains backward compatibility, and provides robust security controls with proper logging.
