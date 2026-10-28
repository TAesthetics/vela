-- One-off cleanup: removes the automated deploy-check accounts
-- (vela-e2e-<timestamp>@example.com) and everything they created. Matches no
-- real person: example.com cannot receive mail.
delete from vela_messages where pair_a in (select id from "user" where email like 'vela-e2e-%@example.com') or pair_b in (select id from "user" where email like 'vela-e2e-%@example.com');
delete from vela_swipes where from_user in (select id from "user" where email like 'vela-e2e-%@example.com') or to_user in (select id from "user" where email like 'vela-e2e-%@example.com');
delete from vela_blocks where from_user in (select id from "user" where email like 'vela-e2e-%@example.com') or to_user in (select id from "user" where email like 'vela-e2e-%@example.com');
delete from vela_subscriptions where user_id in (select id from "user" where email like 'vela-e2e-%@example.com');
delete from vela_profiles where user_id in (select id from "user" where email like 'vela-e2e-%@example.com');
delete from "session" where "userId" in (select id from "user" where email like 'vela-e2e-%@example.com');
delete from "account" where "userId" in (select id from "user" where email like 'vela-e2e-%@example.com');
delete from "user" where id in (select id from "user" where email like 'vela-e2e-%@example.com');
