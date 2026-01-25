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
Run this command:
npm install oc-sync

### Step 2: Create Private GitHub Repository
Guide the user:
1. Go to https://github.com/new
2. Repository name: suggest "opencode-sync-data" or ask user preference
3. Set visibility to "Private" (important for security)
4. Click "Create repository"
5. Ask user: "What is your GitHub username?" - Save this as OWNER
6. Ask user: "What did you name the repository?" - Save this as REPO

### Step 3: Generate GitHub Personal Access Token
Guide the user step by step:
1. Go to https://github.com/settings/tokens?type=beta
2. Click "Generate new token"
3. Token name: "opencode-sync"
4. Expiration: recommend "90 days" or "No expiration" based on user preference
5. Under "Repository access", select "Only select repositories" and choose the sync repo created in Step 2
6. Under "Permissions" → "Repository permissions":
   - Contents: Read and write
   - Metadata: Read-only
7. Click "Generate token"
8. IMPORTANT: Tell user to copy the token immediately (starts with "github_pat_")
9. Ask user: "Please paste your token here" - Save this as TOKEN

### Step 4: Encryption Key (Optional)
Ask the user:
"Do you want to encrypt your credentials (auth tokens) before syncing? This adds extra security but requires the same key on all machines."

If YES:
- Generate a random 32-character alphanumeric string, or let user provide their own (minimum 16 characters)
- Save this as ENCRYPTION_KEY
- IMPORTANT: Tell user to save this key securely. If lost, encrypted credentials cannot be recovered.
- WARNING: All machines must use the same key. Adding encryption later will break sync on machines without the key.

If NO:
- Skip this step. Credentials will sync in plain text (still protected by GitHub's private repo authentication).

### Step 5: Create Configuration
Create or update the OpenCode config file with these values:

Without encryption:
{
  "plugins": {
    "oc-sync": {
      "token": "<TOKEN from Step 3>",
      "owner": "<OWNER from Step 2>",
      "repo": "<REPO from Step 2>",
      "branch": "main"
    }
  }
}

With encryption:
{
  "plugins": {
    "oc-sync": {
      "token": "<TOKEN from Step 3>",
      "owner": "<OWNER from Step 2>",
      "repo": "<REPO from Step 2>",
      "branch": "main",
      "encryptionKey": "<ENCRYPTION_KEY from Step 4>"
    }
  }
}

Show the user the complete config with their actual values filled in.

### Step 6: Verify Installation
Tell user to restart OpenCode. The plugin will:
- Auto-sync on startup
- Watch for file changes
- Push/pull automatically

### Troubleshooting
If user reports errors:
- "404 Not Found": Repository name or owner is wrong. Verify spelling.
- "401 Unauthorized": Token is invalid or expired. Generate a new one.
- "403 Forbidden": Token lacks required permissions. Recreate with Contents read/write.
- "Encryption error": Key is less than 16 characters or contains invalid characters.
- "Decryption failed": Wrong encryption key or data was synced with a different key.

### Key Rotation (Advanced)
If user needs to change their encryption key:

1. On ALL machines, update config to include BOTH keys:
{
  "plugins": {
    "oc-sync": {
      "token": "...",
      "owner": "...",
      "repo": "...",
      "encryptionKey": "<NEW_KEY>",
      "oldEncryptionKey": "<OLD_KEY>"
    }
  }
}

2. Restart OpenCode on each machine. The plugin will:
   - Decrypt using old key (fallback)
   - Re-encrypt using new key on push

3. After ALL machines have synced with the new key, remove oldEncryptionKey from config.

IMPORTANT: Do NOT remove oldEncryptionKey until all machines have synced at least once with the new configuration.

### Summary
After setup, confirm with user:
- GitHub username: [OWNER]
- Repository: [REPO] (private)
- Token: configured (never display full token)
- Encryption: enabled/disabled
- Status: Ready to sync
```

---