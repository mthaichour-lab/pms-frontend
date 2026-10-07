-- Disposable asset for the isolated Docker E2E project only. The regular
-- demonstration positions are already allocated at 100 percent.
INSERT INTO pooling.asset_position
  (asset_id, asset_code, currency_code, outstanding_amount)
VALUES
  ('30000000-0000-4000-8000-0000000000e1', 'E2E-UNALLOCATED', 'DZD', 1000000)
ON CONFLICT (asset_id) DO NOTHING;
