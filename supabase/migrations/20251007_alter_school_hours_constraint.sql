-- Migration: Remove upper limit on school_hours.hours and keep only positive integer constraint
-- Previous constraint likely enforced hours BETWEEN 1 AND 24 (name: school_hours_hours_check)
-- This migration drops that constraint and replaces it with a looser one: hours >= 1

alter table public.school_hours drop constraint if exists school_hours_hours_check;

-- Keep only a lower bound (business requirement: no upper limit) and integer enforced by column type
alter table public.school_hours
    add constraint school_hours_hours_check check (hours >= 1);

comment on constraint school_hours_hours_check on public.school_hours is 'Allow any positive number of hours (>=1) for school sessions.';
