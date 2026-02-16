#!/usr/bin/env python3
"""
Database Migration Script
Run this to add new columns to alerts_config table
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'config', 'dockwatch.db')

def migrate():
    print(f"Connecting to database: {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # Check existing columns
    c.execute("PRAGMA table_info(alerts_config)")
    existing_columns = [row[1] for row in c.fetchall()]
    print(f"Existing columns: {existing_columns}")
    
    # Define migrations
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
    
    # Add missing columns
    added = 0
    for col_name, col_type in migrations:
        if col_name not in existing_columns:
            try:
                c.execute(f"ALTER TABLE alerts_config ADD COLUMN {col_name} {col_type}")
                print(f"✓ Added column: {col_name}")
                added += 1
            except sqlite3.OperationalError as e:
                print(f"✗ Error adding {col_name}: {e}")
    
    conn.commit()
    conn.close()
    
    if added > 0:
        print(f"\n✓ Migration completed! Added {added} columns.")
        print("Please restart the Docker container for changes to take effect.")
    else:
        print("\n✓ Database is already up to date. No migration needed.")

if __name__ == '__main__':
    migrate()
