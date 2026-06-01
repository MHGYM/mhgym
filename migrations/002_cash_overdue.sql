-- Voeg achterstand-tracking kolom toe aan user_memberships
ALTER TABLE user_memberships ADD COLUMN cash_overdue_reminder_sent INTEGER NOT NULL DEFAULT 0;
