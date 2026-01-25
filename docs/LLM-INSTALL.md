# LLM Agent Installation Guide for oc-sync

Copy and paste the following instructions to your LLM agent:

---

```
## Task: Install and Configure oc-sync (OpenCode Sync Plugin)

You are helping the user install oc-sync, which syncs OpenCode data across machines using a private GitHub repository.

### Prerequisites Check
Ask the user:
1. "Do you have Node.js 18 or higher installed?" - If no, guide them to install from https://nodejs.org
2. "Do you have a GitHub account?" - If no, guide them to create one at https://github.com

### Step 1: Install the Package
IMPORTANT: The package must be installed in the OpenCode config directory, NOT globally.

Determine the user's OS and run the appropriate command:

**Linux/macOS:**
cd ~/.config/opencode && npm install oc-sync

**Windows (PowerShell):**
cd $HOME\.config\opencode; npm install oc-sync

**Windows (Command Prompt):**
cd %USERPROFILE%\.config\opencode && npm install oc-sync

This installs the plugin where OpenCode can find it (in the config directory's node_modules/).

NOTE: OpenCode uses XDG paths on ALL platforms. On Windows, this is NOT %APPDATA% - it's %USERPROFILE%\.config\opencode\.

### Step 2: Register the Plugin
IMPORTANT: Installing the package is NOT enough. You must also register it.

Edit the opencode.json file in the config directory:

**Linux/macOS:** ~/.config/opencode/opencode.json
**Windows:** %USERPROFILE%\.config\opencode\opencode.json

Add the plugin array:

{
  "plugin": ["oc-sync"]
}

NOTE: The key is "plugin" (singular), NOT "plugins" (plural).

If opencode.json already exists with other settings, just add "oc-sync" to the existing plugin array.

### Step 3: Generate GitHub Personal Access Token
Guide the user step by step:
1. Go to https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Token name: "opencode-sync"
4. Expiration: recommend "90 days" or "No expiration" based on user preference
5. Select scope: "repo" (Full control of private repositories)
6. Click "Generate token"
7. IMPORTANT: Tell user to copy the token immediately (starts with "ghp_")
8. Ask user: "Please paste your token here" - Save this as TOKEN

### Step 4: Create Token Configuration
Create the config file opencode-sync.json in the config directory:

**Linux/macOS:** ~/.config/opencode/opencode-sync.json
**Windows:** %USERPROFILE%\.config\opencode\opencode-sync.json

{
  "token": "<TOKEN from Step 3>"
}

That's it! The plugin will automatically:
- Detect your GitHub username
- Create a private repository (.opencode-sync)
- Detect the default branch (main/master)

### Step 5: Verify Installation
Tell user to restart OpenCode. The plugin will:
- Auto-create the sync repository if needed
- Sync on startup
- Watch for file changes
- Push/pull automatically

Check logs at:
**Linux/macOS:** ~/.local/share/opencode/log/opencode-sync.log
**Windows:** %USERPROFILE%\.local\share\opencode\log\opencode-sync.log

Expected output:
[opencode-sync] Plugin starting...
[opencode-sync] Token loaded from: config file
[opencode-sync] Setting up sync storage...
[opencode-sync] Linked to repo: username/.opencode-sync
[opencode-sync] Plugin ready

### Troubleshooting

#### Plugin not loading (no log output)
- Check plugin is installed in correct location:
  - Linux/macOS: ls ~/.config/opencode/node_modules/oc-sync
  - Windows: dir %USERPROFILE%\.config\opencode\node_modules\oc-sync
- Check plugin is registered in opencode.json with "plugin" (singular) key
- Check opencode.json is valid JSON (no trailing commas, etc.)

#### API Errors
- "401 Unauthorized": Token is invalid or expired. Generate a new one.
- "403 Forbidden": Token lacks "repo" scope. Recreate with correct permissions.
- "Not Found": Check token has repo scope for creating private repositories.

### Advanced Options (Optional)
These settings are auto-detected but can be overridden if needed:

{
  "token": "ghp_...",
  "repoOwner": "custom-username",      // Override auto-detected username
  "repoName": "custom-repo-name",      // Override default .opencode-sync
  "branch": "custom-branch",           // Override auto-detected main/master
  "encryptionKey": "your-secret-key"   // Encrypt credentials before sync
}

### Encryption (Optional)
If user wants to encrypt credentials:
1. Add encryptionKey to config (minimum 16 characters)
2. WARNING: Same key must be used on ALL machines
3. WARNING: If key is lost, encrypted credentials cannot be recovered

### Key Rotation (Advanced)
If user needs to change their encryption key:

1. On ALL machines, update config to include BOTH keys:
{
  "token": "...",
  "encryptionKey": "<NEW_KEY>",
  "oldEncryptionKey": "<OLD_KEY>"
}

2. Restart OpenCode on each machine. The plugin will:
   - Decrypt using old key (fallback)
   - Re-encrypt using new key on push

3. After ALL machines have synced, remove oldEncryptionKey.

### Summary
After setup, confirm with user:
- Token: configured (never display full token)
- Status: Ready to sync
```

---
