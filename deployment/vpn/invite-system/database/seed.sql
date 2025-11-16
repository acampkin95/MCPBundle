-- Seed data for testing (DO NOT use in production)
-- This creates sample invites and peers for development/testing purposes

BEGIN;

-- Sample invites
INSERT INTO invites (token, created_by, created_by_email, recipient_name, recipient_email, notes, status, expires_at)
VALUES
    ('test_token_1_demo_only_12345678', 'admin-user-id', 'admin@example.com', 'John Doe', 'john@example.com', 'Test invite for development', 'pending', NOW() + INTERVAL '2 hours'),
    ('test_token_2_demo_only_87654321', 'admin-user-id', 'admin@example.com', 'Jane Smith', 'jane@example.com', 'Another test invite', 'pending', NOW() + INTERVAL '1 hour'),
    ('test_token_3_demo_only_11111111', 'user-user-id', 'user@example.com', 'Bob Wilson', 'bob@example.com', NULL, 'claimed', NOW() - INTERVAL '1 hour');

-- Sample peer (for claimed invite)
INSERT INTO peers (invite_id, user_id, user_email, device_name, public_key, private_key, preshared_key, ip_address, status)
SELECT
    id,
    'bob-user-id',
    'bob@example.com',
    'Bob Laptop',
    'dGVzdC1wdWJsaWMta2V5LTExMTExMTExMTExMTExMTEx',
    'dGVzdC1wcml2YXRlLWtleS0xMTExMTExMTExMTExMTEx',
    'dGVzdC1wcmVzaGFyZWQta2V5LTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTEx',
    '10.10.10.100',
    'active'
FROM invites
WHERE token = 'test_token_3_demo_only_11111111';

-- Sample audit log entries
INSERT INTO audit_log (user_id, action, resource_type, resource_id, details, ip_address)
SELECT
    'admin-user-id',
    'invite_created',
    'invite',
    id,
    jsonb_build_object('recipient', recipient_email),
    '192.168.1.100'
FROM invites
WHERE created_by = 'admin-user-id';

COMMIT;

-- Verify seed data
SELECT 'Invites:' AS table_name, COUNT(*) AS count FROM invites
UNION ALL
SELECT 'Peers:', COUNT(*) FROM peers
UNION ALL
SELECT 'Audit Log:', COUNT(*) FROM audit_log;
