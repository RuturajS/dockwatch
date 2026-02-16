# Database Migration Instructions

## Problem
The database is missing new columns for Discord, Telegram, and notification toggles.

## Solution
Run the migration script to add the missing columns.

### From WSL (Recommended)

1. Open WSL terminal
2. Navigate to the project directory:
   ```bash
   cd /mnt/c/Users/rutur/OneDrive/Desktop/Ai-Projects/dockerLoger/dockwatch
   ```

3. Run the migration script inside the running container:
   ```bash
   docker compose exec dockwatch python /app/migrate_db.py
   ```

   OR if that doesn't work, copy and run it directly:
   ```bash
   docker compose exec dockwatch python -c "
   import sqlite3
   conn = sqlite3.connect('/app/config/dockwatch.db')
   c = conn.cursor()
   c.execute('PRAGMA table_info(alerts_config)')
   existing = [row[1] for row in c.fetchall()]
   migrations = [
       ('slack_enabled', 'INTEGER DEFAULT 0'),
       ('discord_webhook', 'TEXT'),
       ('discord_enabled', 'INTEGER DEFAULT 0'),
       ('telegram_bot_token', 'TEXT'),
       ('telegram_chat_id', 'TEXT'),
       ('telegram_enabled', 'INTEGER DEFAULT 0'),
       ('generic_enabled', 'INTEGER DEFAULT 0'),
       ('email_enabled', 'INTEGER DEFAULT 0')
   ]
   for col, typ in migrations:
       if col not in existing:
           c.execute(f'ALTER TABLE alerts_config ADD COLUMN {col} {typ}')
           print(f'Added: {col}')
   conn.commit()
   conn.close()
   print('Migration complete!')
   "
   ```

4. Restart the container:
   ```bash
   docker compose restart dockwatch
   ```

### Alternative: Rebuild Container (Clean Solution)

If you want to rebuild with all the latest code:

```bash
cd /mnt/c/Users/rutur/OneDrive/Desktop/Ai-Projects/dockerLoger/dockwatch
docker compose up --build -d
```

This will automatically run the migration on startup.

## Verify Migration

After running the migration, check the logs:
```bash
docker compose logs dockwatch | grep -i "added column"
```

You should see output like:
```
Added column: slack_enabled
Added column: discord_webhook
...
```
