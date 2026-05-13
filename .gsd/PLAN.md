---
phase: 1
plan: 1
wave: 1
depends_on: []
files_modified: ["supabase_schema.sql", "server.js"]
autonomous: true
user_setup:
  - service: supabase
    why: "Need to run SQL in Supabase dashboard to create admins table"
    dashboard_config:
      - task: "Run SQL to create admins table"
        location: "Supabase Dashboard -> SQL Editor"
must_haves:
  truths:
    - "Database has a way to identify admins"
    - "Backend returns admin status for users"
  artifacts:
    - "admins table exists in Supabase"
    - "server.js /api/auth/me returns isAdmin flag"
---

# Plan 1.1: Database and Backend Setup for Admin Role

<objective>
Set up the database table and backend logic to identify admin users.

Purpose: To distinguish between regular users and authorized admins.
Output: Admins table in Supabase and updated /api/auth/me endpoint.
</objective>

<context>
Load for context:
- supabase_schema.sql
- server.js
</context>

<tasks>

<task type="auto">
  <name>Update Supabase Schema for Admins</name>
  <files>supabase_schema.sql</files>
  <action>
    Append the SQL to create the `admins` table at the end of `supabase_schema.sql`.
    The table should have a `user_id` UUID referencing `auth.users(id)` and a `created_at` timestamp.
    Add a note that this needs to be run in the Supabase dashboard.
  </action>
  <verify>Check file content of supabase_schema.sql</verify>
  <done>SQL added to the file.</done>
</task>

<task type="auto">
  <name>Update /api/auth/me to include isAdmin</name>
  <files>server.js</files>
  <action>
    In `server.js`, update the `/api/auth/me` endpoint.
    After fetching the profile, check if the `user.id` exists in the `admins` table.
    Add `isAdmin: true` or `false` to the response JSON.
  </action>
  <verify>Restart server and test endpoint with a mock token (if possible) or review code.</verify>
  <done>Endpoint returns isAdmin flag.</done>
</task>

</tasks>

<verification>
After all tasks, verify:
- [ ] SQL for admins table is in supabase_schema.sql
- [ ] server.js has logic to query admins table and return isAdmin
</verification>

<success_criteria>
- [ ] All tasks verified
- [ ] Must-haves confirmed
</success_criteria>

---
phase: 1
plan: 2
wave: 2
depends_on: ["1.1"]
files_modified: ["public/login.html", "public/admin.html"]
autonomous: true
must_haves:
  truths:
    - "Users are redirected to correct path based on role"
    - "Admin page is protected"
  artifacts:
    - "public/login.html handles redirection"
    - "public/admin.html verifies admin status"
---

# Plan 1.2: Frontend Routing & Verification

<objective>
Update the login flow to route users based on role and protect the admin page.

Purpose: To ensure admins go to the admin panel and users go to the main page, and prevent unauthorized access to the admin panel.
Output: Updated login.html and admin.html.
</objective>

<context>
Load for context:
- public/login.html
- public/admin.html
</context>

<tasks>

<task type="auto">
  <name>Update login.html for Role-Based Routing</name>
  <files>public/login.html</files>
  <action>
    Update the login logic in `public/login.html`.
    After successful login and calling `/api/auth/me`, check the `isAdmin` flag.
    If `isAdmin` is true, redirect to `admin.html`.
    Otherwise, redirect to `index.html`.
  </action>
  <verify>Review code in login.html</verify>
  <done>Login redirects based on isAdmin.</done>
</task>

<task type="auto">
  <name>Protect admin.html</name>
  <files>public/admin.html</files>
  <action>
    Update `public/admin.html` to check authorization on load.
    Call `/api/auth/me` (or check stored session).
    If `isAdmin` is not true, redirect to `login.html` or show an access denied message.
  </action>
  <verify>Review code in admin.html</verify>
  <done>Admin page checks for admin status on load.</done>
</task>

</tasks>

<verification>
After all tasks, verify:
- [ ] login.html has redirection logic
- [ ] admin.html has protection logic
</verification>

<success_criteria>
- [ ] All tasks verified
- [ ] Must-haves confirmed
</success_criteria>

---
phase: 2
plan: 1
wave: 1
depends_on: ["1.2"]
files_modified: ["public/login.html"]
autonomous: true
must_haves:
  truths:
    - "Login page has options for User, Admin, and Station Manager"
    - "Admin option redirects to admin.html"
    - "Station Manager option is a placeholder with no functionality"
  artifacts:
    - "public/login.html updated with role selection UI"
---

# Plan 2.1: Role-Based Login Portal Redesign

<objective>
Redesign the login page to act as a role-selection portal with three options: User, Admin, and Station Manager.
Purpose: Allow users to explicitly choose their role. User goes to the main app (or signs in), Admin goes to the admin panel, and Station Manager acts as a visual placeholder for future implementation.
Output: Updated login.html with three distinct role options.
</objective>

<context>
Load for context:
- public/login.html
</context>

<tasks>

<task type="auto">
  <name>Redesign login.html</name>
  <files>public/login.html</files>
  <action>
    Replace the current login screen with a role-selection UI featuring three cards/buttons:
    1. User: Follows the existing Google Sign-In flow (or enters the app).
    2. Admin: Triggers the admin login or redirects to `admin.html` (which handles its own auth check).
    3. Station Manager: A placeholder image/card with no active functionality right now.
  </action>
  <verify>Review code in login.html</verify>
  <done>Login page redesigned with three role options.</done>
</task>

</tasks>

<verification>
After all tasks, verify:
- [x] login.html presents User, Admin, and Station Manager options
- [x] Admin option logic is implemented correctly
- [x] Station Manager option is a non-functional placeholder
</verification>

<success_criteria>
- [x] All tasks verified
- [x] Must-haves confirmed
</success_criteria>
