-- Drop unique constraint on id_card to allow multiple registrations per person per brigada
ALTER TABLE users DROP INDEX id_card;