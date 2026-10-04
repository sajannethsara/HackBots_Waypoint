-- Order numbers (ORD-0000123) come from one database sequence, so two orders can never be given the same
-- number, even when several outlets submit at the same instant. The seed moves it past the historical numbers.
CREATE SEQUENCE IF NOT EXISTS order_ref_seq START WITH 1;
