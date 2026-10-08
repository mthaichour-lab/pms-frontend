-- Disposable asset for the isolated Docker E2E project only. The regular
-- demonstration positions are already allocated at 100 percent.
INSERT INTO pooling.asset_position
  (asset_id, asset_code, currency_code, outstanding_amount)
VALUES
  ('30000000-0000-4000-8000-0000000000e1', 'E2E-UNALLOCATED', 'DZD', 1000000)
ON CONFLICT (asset_id) DO NOTHING;

-- Certified data required by the quotation engine. It belongs exclusively to
-- the disposable E2E database and leaves the local demo portfolio unchanged.
INSERT INTO calculation.run (
  run_id, pool_id, business_date, rules_version, engine_version,
  correlation_id, status, input_checksum_sha256, output_checksum_sha256,
  input_snapshot, distributable_amount, currency_code
) VALUES (
  '40000000-0000-4000-8000-0000000000e1', 'GLOBAL_POOL', '2026-10-07',
  'e2e-quotation-v1', 'pms-e2e/1.0', '40000000-0000-4000-8000-0000000000e2',
  'CALCULATED', repeat('a', 64), repeat('b', 64), '{}'::jsonb, 12000000, 'DZD'
) ON CONFLICT (run_id) DO NOTHING;

INSERT INTO pooling.distributable_result (
  pool_id, business_date, amount, currency_code, source_reference
) VALUES (
  'GLOBAL_POOL', '2026-10-07', 12000000, 'DZD', 'E2E_QUOTATION_CERTIFIED'
) ON CONFLICT (pool_id, business_date) DO NOTHING;

INSERT INTO pooling.composition_snapshot (
  pool_id, business_date, currency_code, total_resources, bank_equity,
  iah_restricted, iah_unrestricted, invested_amount, uninvested_liquidity,
  maturity_gaps, currency_gaps, run_id, certified, checksum_sha256
) VALUES (
  'GLOBAL_POOL', '2026-10-07', 'DZD', 2000000000, 420000000, 0, 1580000000,
  1000000000, 1000000000, '[]'::jsonb, '[]'::jsonb,
  '40000000-0000-4000-8000-0000000000e1', true, repeat('c', 64)
) ON CONFLICT (pool_id, business_date) DO NOTHING;
