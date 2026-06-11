# PLMun Inventory Nexus v2 Beta 0.5 Stable

Release date: June 12, 2026

## Highlights

- Stabilized request tracking so approved requests stay trackable and completed requests represent closed work only.
- Added borrower-first request context for staff/admin workflows, including safer borrower summaries.
- Improved credit policy handling, including clearer assistant guidance and admin credit restoration.
- Added due-date calendars to the dashboard for borrowers and staff/admin users.
- Polished the login/register experience with the updated school-themed visual system.
- Expanded audit log filtering and frontend controls for easier review.

## Backend

- Added stricter credit policy behavior: borrower accounts are restricted only when credit drops below 75, with admin restoration support.
- Added an admin credit restore action that resets eligible borrower accounts to active, unflagged, and full credit.
- Expanded audit log filters for user, role, item, request number, and date ranges.
- Improved assistant context for profanity de-escalation, longer explanations, credit score questions, account restriction rules, and automation requirements.
- Hardened messaging WebSocket presence handling so tests no longer hit a missing user attribute.
- Updated request automation and request serializer coverage for borrower data and approval tracking.

## Frontend

- Redesigned the Requests page into a cleaner dashboard-style workflow with borrower-first staff/admin search and stable action visibility.
- Added a reusable due calendar on the dashboard:
  - Student/Faculty users see their own active returnable due dates below My Favorites.
  - Staff/Admin users see visible borrower due dates below Inventory by Category.
- Refreshed login and register pages with the green/yellow school theme, smoother layout, and shared auth components.
- Added user-management support for restoring credit from the admin interface.
- Added audit log filters for role, item, request number, and date range.
- Removed the older animated input component in favor of the new auth input system.

## Quality And Safety

- Confirmed local `.env` files remain ignored and only placeholder `.env.example` files are tracked.
- Captured expected assistant-provider unavailable logs inside tests so intentional failure-path checks stay readable.
- Kept the release focused on existing dependencies and avoided adding heavy UI or animation libraries.

## Notes

- The Git tag for this release is `v2-beta-0.5-stable`.
- The local backend may still warn if `Backend/staticfiles/` is missing; that warning does not block tests.
- The frontend build may still warn about large chunks until code-splitting is handled in a later optimization pass.
