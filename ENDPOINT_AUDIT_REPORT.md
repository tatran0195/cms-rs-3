# API Endpoints Verification Report

**Test Timestamp**: 2026-10-09T13:17:13.576Z
**Total Endpoints Tested**: 123
**Wired Endpoints**: 123/123 (100.0%)
**Working / Validated**: 113/123 (91.9%)

| # | Method | Endpoint Route | Status Code | Wired | Working | Response Note |
|---|---|---|---|---|---|---|
| 1 | `POST` | `/api/app/members/invite` | `400` | ✅ | ✅ | {"error":{"code":"validation:invalid_input","message":"Invalid input: Invalid ro |
| 2 | `PATCH` | `/api/app/members/:id/role` | `400` | ✅ | ✅ | {"error":{"code":"validation:invalid_input","message":"Invalid input: Invalid ro |
| 3 | `DELETE` | `/api/app/members/:id` | `400` | ✅ | ✅ | {"error":{"code":"validation:invalid_input","message":"Invalid input: You cannot |
| 4 | `GET` | `/api/app/members` | `200` | ✅ | ✅ | {"data":{"members":[{"id":"323b7cab-a652-4b28-8df5-ef6c91dcf15c","userId":"323b7 |
| 5 | `POST` | `/api/app/notifications/read` | `200` | ✅ | ✅ | {"success":true} |
| 6 | `GET` | `/api/app/notifications/unread-count` | `200` | ✅ | ✅ | {"total":0,"unread":0,"by_type":{}} |
| 7 | `GET` | `/api/app/notifications` | `200` | ✅ | ✅ | {"data":[],"total":0,"page":1,"page_size":20,"total_pages":0} |
| 8 | `POST` | `/api/app/projects/:id/theme-template/import` | `200` | ✅ | ✅ | {"data":{"id":"771fd028-0485-42e5-8426-a79ccad4b752","name":"Imported theme 1791 |
| 9 | `GET` | `/api/app/projects/:id/theme-template` | `200` | ✅ | ✅ | {"data":{"id":"bf96a528-f4b6-467b-ae03-4048b9a72245","name":"default","primaryCo |
| 10 | `GET` | `/api/app/projects/:id/theme-repository` | `200` | ✅ | ✅ | { "exportedAt": "2026-10-09T13:17:11.755319200+00:00", "projectId": "bf96a52 |
| 11 | `GET` | `/api/app/projects/:id/export` | `404` | ✅ | ✅ | {"error":{"code":"not_found","message":"API endpoint not found"}} |
| 12 | `DELETE` | `/api/app/projects/:id` | `200` | ✅ | ✅ | {"data":{"success":true,"id":"bf96a528-f4b6-467b-ae03-4048b9a72245"}} |
| 13 | `GET` | `/api/app/projects/:id` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 14 | `PATCH` | `/api/app/projects/:id` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 15 | `POST` | `/api/app/projects/:projectId/addons/:addonId/activate` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Addon not found","detail |
| 16 | `POST` | `/api/app/projects/:projectId/addons/:addonId/deactivate` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Addon not found","detail |
| 17 | `PATCH` | `/api/app/projects/:projectId/addons/:addonId` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Addon not found","detail |
| 18 | `GET` | `/api/app/projects/:projectId/addons` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 19 | `POST` | `/api/app/projects/:projectId/ai` | `405` | ✅ | ⚠️ | OK |
| 20 | `GET` | `/api/app/projects/:projectId/analytics` | `200` | ✅ | ✅ | {"data":{"availability":"available","totalViews":0,"uniqueVisitors":null,"viewsP |
| 21 | `POST` | `/api/app/projects/:projectId/assets/confirm` | `422` | ✅ | ✅ | Failed to deserialize the JSON body into the target type: missing field `key` at |
| 22 | `POST` | `/api/app/projects/:projectId/assets/presign` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 23 | `POST` | `/api/app/projects/:projectId/branches/:id/merge` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Branch not found","detai |
| 24 | `GET` | `/api/app/projects/:projectId/branches` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 25 | `POST` | `/api/app/projects/:projectId/branches` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 26 | `DELETE` | `/api/app/projects/:projectId/branches/:id` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 27 | `DELETE` | `/api/app/projects/:projectId/comments/:id` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Comment not found","deta |
| 28 | `PATCH` | `/api/app/projects/:projectId/comments/:id` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Comment not found","deta |
| 29 | `GET` | `/api/app/projects/:projectId/comments` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 30 | `POST` | `/api/app/projects/:projectId/comments` | `400` | ✅ | ✅ | {"error":{"code":"validation:invalid_input","message":"Invalid input: pageId is  |
| 31 | `GET` | `/api/app/projects/:projectId/deployments/changes` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 32 | `POST` | `/api/app/projects/:projectId/deployments/:id/rollback` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Target deployment not fo |
| 33 | `GET` | `/api/app/projects/:projectId/deployments` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 34 | `POST` | `/api/app/projects/:projectId/deployments` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 35 | `POST` | `/api/app/projects/:projectId/domains/:id/primary` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 36 | `POST` | `/api/app/projects/:projectId/domains/:id/verify` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 37 | `DELETE` | `/api/app/projects/:projectId/domains/:id` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 38 | `GET` | `/api/app/projects/:projectId/domains` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 39 | `POST` | `/api/app/projects/:projectId/domains` | `400` | ✅ | ✅ | {"error":{"code":"http:bad_request","message":"Bad Request: Invalid JSON: Failed |
| 40 | `POST` | `/api/app/projects/:projectId/exports/schedules/:scheduleId/run` | `405` | ✅ | ⚠️ | OK |
| 41 | `PATCH` | `/api/app/projects/:projectId/exports/schedules/:scheduleId` | `405` | ✅ | ⚠️ | OK |
| 42 | `GET` | `/api/app/projects/:projectId/exports/schedules` | `404` | ✅ | ✅ | {"error":{"code":"not_found","message":"API endpoint not found"}} |
| 43 | `POST` | `/api/app/projects/:projectId/exports/schedules` | `405` | ✅ | ⚠️ | OK |
| 44 | `GET` | `/api/app/projects/:projectId/exports/:id/artifacts/:artifactId/download` | `404` | ✅ | ✅ | {"error":{"code":"not_found","message":"API endpoint not found"}} |
| 45 | `POST` | `/api/app/projects/:projectId/exports/:id/cancel` | `405` | ✅ | ⚠️ | OK |
| 46 | `GET` | `/api/app/projects/:projectId/exports` | `404` | ✅ | ✅ | {"error":{"code":"not_found","message":"API endpoint not found"}} |
| 47 | `POST` | `/api/app/projects/:projectId/exports` | `405` | ✅ | ⚠️ | OK |
| 48 | `POST` | `/api/app/projects/:projectId/git/authorize` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 49 | `POST` | `/api/app/projects/:projectId/git/conflicts/:conflictId/resolve` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Conflict not found","det |
| 50 | `DELETE` | `/api/app/projects/:projectId/git/connection` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 51 | `PUT` | `/api/app/projects/:projectId/git/connection` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 52 | `POST` | `/api/app/projects/:projectId/git/operations` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 53 | `POST` | `/api/app/projects/:projectId/git/webhook-secret` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 54 | `GET` | `/api/app/projects/:projectId/git` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 55 | `POST` | `/api/app/projects/:projectId/integrations/:providerId/verify` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Integration 'test-provid |
| 56 | `POST` | `/api/app/projects/:projectId/integrations/:providerId/delete-confirmation` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Integration 'test-provid |
| 57 | `DELETE` | `/api/app/projects/:projectId/integrations/:providerId` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Integration 'test-provid |
| 58 | `PATCH` | `/api/app/projects/:projectId/integrations/:providerId` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Integration 'test-provid |
| 59 | `GET` | `/api/app/projects/:projectId/integrations` | `200` | ✅ | ✅ | {"data":[]} |
| 60 | `POST` | `/api/app/projects/:projectId/integrations` | `500` | ✅ | ⚠️ | {"error":{"code":"database:error","message":"An internal database error occurred |
| 61 | `DELETE` | `/api/app/projects/:projectId/languages/:id` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 62 | `PATCH` | `/api/app/projects/:projectId/languages/:id` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 63 | `GET` | `/api/app/projects/:projectId/languages` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 64 | `POST` | `/api/app/projects/:projectId/languages` | `422` | ✅ | ✅ | Failed to deserialize the JSON body into the target type: missing field `code` a |
| 65 | `DELETE` | `/api/app/projects/:projectId/members/invitations/:id` | `200` | ✅ | ✅ | {"data":{"success":true,"id":"test-id"}} |
| 66 | `POST` | `/api/app/projects/:projectId/members/invite` | `200` | ✅ | ✅ | {"data":{"id":"052e8f78-af8d-49f4-9856-022209fabae2","email":"colleague@example. |
| 67 | `PATCH` | `/api/app/projects/:projectId/members/:id/role` | `500` | ✅ | ⚠️ | {"error":{"code":"database:error","message":"An internal database error occurred |
| 68 | `DELETE` | `/api/app/projects/:projectId/members/:id` | `200` | ✅ | ✅ | {"data":{"success":true,"id":"323b7cab-a652-4b28-8df5-ef6c91dcf15c"}} |
| 69 | `POST` | `/api/app/projects/:projectId/members/transfer-ownership` | `400` | ✅ | ✅ | {"error":{"code":"validation:invalid_input","message":"Invalid input: memberId i |
| 70 | `GET` | `/api/app/projects/:projectId/members` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 71 | `POST` | `/api/app/projects/:projectId/openapi/sync` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 72 | `DELETE` | `/api/app/projects/:projectId/openapi` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 73 | `GET` | `/api/app/projects/:projectId/openapi` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 74 | `PUT` | `/api/app/projects/:projectId/openapi` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 75 | `POST` | `/api/app/projects/:projectId/pages/reorder` | `400` | ✅ | ✅ | {"error":{"code":"http:bad_request","message":"Bad Request: Invalid JSON: Failed |
| 76 | `DELETE` | `/api/app/projects/:projectId/pages/:id` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 77 | `GET` | `/api/app/projects/:projectId/pages/:id` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 78 | `PATCH` | `/api/app/projects/:projectId/pages/:id` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 79 | `GET` | `/api/app/projects/:projectId/pages` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 80 | `POST` | `/api/app/projects/:projectId/pages` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 81 | `POST` | `/api/app/projects/:projectId/settings/git/import` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 82 | `POST` | `/api/app/projects/:projectId/settings/git/webhook-secret` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 83 | `POST` | `/api/app/projects/:projectId/settings/import/ghost` | `501` | ✅ | ⚠️ | {"error":{"code":"internal:error","message":"An internal server error occurred", |
| 84 | `POST` | `/api/app/projects/:projectId/settings/import/mintlify` | `501` | ✅ | ⚠️ | {"error":{"code":"internal:error","message":"An internal server error occurred", |
| 85 | `GET` | `/api/app/projects/:projectId/settings/search/diagnostics` | `200` | ✅ | ✅ | {"data":{"availability":{"configured":false,"reason":null},"health":"empty","run |
| 86 | `POST` | `/api/app/projects/:projectId/settings/search/reindex` | `409` | ✅ | ✅ | {"error":{"code":"http:conflict","message":"Conflict: Project has no default bra |
| 87 | `GET` | `/api/app/projects/:projectId/settings/search` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 88 | `PATCH` | `/api/app/projects/:projectId/settings/search` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 89 | `GET` | `/api/app/projects/:projectId/settings/usage` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 90 | `GET` | `/api/app/projects/:projectId/settings` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 91 | `PATCH` | `/api/app/projects/:projectId/settings` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 92 | `POST` | `/api/app/projects/:projectId/api-keys/:id/rotate` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 93 | `DELETE` | `/api/app/projects/:projectId/api-keys/:id` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 94 | `GET` | `/api/app/projects/:projectId/api-keys` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 95 | `POST` | `/api/app/projects/:projectId/api-keys` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 96 | `DELETE` | `/api/app/projects/:projectId/reader-access/audiences/:audienceId` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 97 | `POST` | `/api/app/projects/:projectId/reader-access/audiences` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 98 | `POST` | `/api/app/projects/:projectId/reader-access/jwt/test` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 99 | `PUT` | `/api/app/projects/:projectId/reader-access/jwt` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 100 | `PUT` | `/api/app/projects/:projectId/reader-access/mode` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 101 | `POST` | `/api/app/projects/:projectId/reader-access/readers/invite` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 102 | `POST` | `/api/app/projects/:projectId/reader-access/readers/:readerId/revoke` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 103 | `POST` | `/api/app/projects/:projectId/reader-access/emergency-revoke` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 104 | `GET` | `/api/app/projects/:projectId/reader-access` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Project not found","deta |
| 105 | `GET` | `/api/app/projects` | `200` | ✅ | ✅ | {"data":[{"id":"2b1a049b-a003-4887-b7e5-5b2012e118dc","name":"Company Docs","slu |
| 106 | `POST` | `/api/app/projects` | `201` | ✅ | ✅ | {"data":{"id":"d450a2e1-7605-48b1-be23-1f36de4529cb","name":"Updated Title","slu |
| 107 | `GET` | `/api/app/workspace/analytics` | `200` | ✅ | ✅ | {"data":{"availability":"available","totalViews":0,"uniqueVisitors":0,"viewsPrev |
| 108 | `GET` | `/api/app/workspace` | `200` | ✅ | ✅ | {"data":{"name":"Acme Corp Internal CMS","slug":"workspace","notifications":{}," |
| 109 | `PATCH` | `/api/app/workspace` | `200` | ✅ | ✅ | {"data":{"name":"Updated Title","slug":"workspace","notifications":{},"integrati |
| 110 | `GET` | `/api/public/git/previews/:token` | `200` | ✅ | ✅ | {"data":null} |
| 111 | `GET` | `/api/public/invitations/:id` | `200` | ✅ | ✅ | {"data":{"email":"invitee@internal.company","expiresAt":"2026-10-16T13:17:13.336 |
| 112 | `GET` | `/api/public/meta` | `200` | ✅ | ✅ | {"providers":{"github":false,"google":false}} |
| 113 | `GET` | `/api/public/pages/:id` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Page not found","details |
| 114 | `POST` | `/api/public/sites/:id/answer` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Site not found","details |
| 115 | `GET` | `/api/public/sites/:id/changelog` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Site not found","details |
| 116 | `POST` | `/api/public/sites/:id/events` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Site not found","details |
| 117 | `GET` | `/api/public/sites/:id/page` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Site not found","details |
| 118 | `GET` | `/api/public/sites/:id/search` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Site not found","details |
| 119 | `GET` | `/api/public/sites/:id` | `404` | ✅ | ✅ | {"error":{"code":"http:not_found","message":"Not Found: Site not found","details |
| 120 | `GET` | `/api/health` | `200` | ✅ | ✅ | {"status":"healthy","database":"connected","database_latency_ms":1,"timestamp":" |
| 121 | `GET` | `/api/api-docs/openapi.json` | `200` | ✅ | ✅ | {"openapi":"3.1.0","info":{"title":"CMS API","description":"CMS REST API for man |
| 122 | `GET` | `/api/auth/me` | `200` | ✅ | ✅ | {"id":"323b7cab-a652-4b28-8df5-ef6c91dcf15c","email":"admin@example.com","name": |
| 123 | `GET` | `/api/auth/get-session` | `200` | ✅ | ✅ | {"session":{"id":"323b7cab-a652-4b28-8df5-ef6c91dcf15c","token":"session","userI |
