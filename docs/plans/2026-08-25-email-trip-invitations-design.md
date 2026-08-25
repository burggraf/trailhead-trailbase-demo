# Email Trip Invitations Design

## Goal

Replace manually shared invitation tokens with formatted email invitations that work for recipients with verified accounts, unverified accounts, or no account, while requiring explicit acceptance before trip membership is granted.

## Invitation data and delivery

`trip_invites` stores only pending invitations. Each invitation contains the trip, inviter, recipient email, proposed role, seven-day expiry, email delivery status, and last-send timestamp. A unique trip/email constraint prevents duplicate pending invitations.

Inviting the same address again updates the role, renews the seven-day expiry, and resends the email. Existing trip members cannot be invited. Accepting, declining, owner cancellation, and expiry remove the pending row; accepted membership and the activity log already preserve the durable outcome.

The extension checks `_user.email` and `_user.unverified_email` only to select email wording:

1. A verified account is prompted to sign in and review the invitation.
2. An unverified account is prompted to finish verification and then review it.
3. An unknown address is prompted to create and verify an account before reviewing it.

The invitation API never reveals which account state was found.

Formatted messages include the trip, destination, inviter, proposed role, expiry, and a generic `/invitations` link. No bearer token is placed in the email. Dynamic content is HTML-escaped.

Development delivery uses Mailpit's `POST /api/v1/send`; messages are visible at `http://localhost:8025`, so no Resend account is needed. When protected component preferences contain Resend configuration, delivery switches to `https://api.resend.com/emails`. An admin-only endpoint stores the Resend API key, verified sender, and public application URL without committing secrets.

Invitation creation remains successful when email delivery fails because the invitation remains discoverable in-app. Owners see the failed delivery state and may resend it.

## Recipient experience

`/invitations` is the single invitation destination.

Signed-out visitors see an explanation plus Create account and Sign in actions. Both TrailBase authentication flows preserve `/invitations` as the return path. No invitation data is exposed until authentication succeeds.

Signed-in users see all pending invitations matching their verified account email. Each card shows trip name, destination, inviter, proposed role, and expiry, with Accept and Decline actions.

Acceptance transactionally rechecks the authenticated email and expiry, creates membership, records the activity event, and deletes the invitation. Declining deletes the invitation without creating membership.

A lightweight authenticated-app gate checks pending invitations on initial load. It redirects to `/invitations` at most once per user per browser session. The page is not blocking: users may leave without responding. A persistent Invitations header item and count badge, visible on desktop and mobile, remain until invitations are accepted, declined, cancelled, or expired.

## Owner experience

The trip Members screen lists current members and pending invitations. Owners can see the proposed role, delivery state, and expiry; resend and renew an invitation; or cancel it immediately. Cancellation deletes the pending row, making it impossible to accept. Removing an already accepted person remains a separate member-removal action.

## API routes

- `POST /trailhead/trips/{trip}/invites` creates or updates and sends an invitation.
- `GET /trailhead/invites` lists invitations matching the authenticated email.
- `POST /trailhead/invites/{id}/accept` accepts an invitation.
- `DELETE /trailhead/invites/{id}` declines an invitation.
- `GET /trailhead/trips/{trip}/invites` lists pending invitations for an owner.
- `POST /trailhead/trips/{trip}/invites/{id}/resend` renews and resends an invitation.
- `DELETE /trailhead/trips/{trip}/invites/{id}` cancels an invitation.
- Admin-only email settings routes configure production Resend delivery.

Every recipient action requires authentication and an email match. Every trip-scoped management action requires owner membership. Delivery uses a Resend idempotency key to reduce duplicate production messages.

## Error handling and verification

Frontend test-first cycles cover the signed-out landing page, login return path, once-per-session redirect, persistent invitation indicator, accept/decline actions, and owner invitation controls.

Rust helper tests cover HTML escaping, Mailpit and Resend payload generation, recipient account-state selection, and expiry behavior. The pinned TrailBase guest SDK cannot link its exported WASI symbols in native tests, so route authorization and transaction behavior are verified through HTTP smoke tests.

Manual development verification runs `./dev.sh`, creates invitations for verified, unverified, and unknown addresses, inspects formatted Mailpit messages, and exercises registration, verification, acceptance, decline, resend, cancellation, mismatch, and expiry scenarios.

## Deliberate omissions

There is no background mail queue, invitation history table, or provider abstraction beyond the two required HTTP payloads. Add durable automatic retries only if manual resend and in-app discovery prove insufficient in production.
